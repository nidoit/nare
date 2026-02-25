use std::fs;
use std::io::Write as _;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// ── Embedded bridge source ──────────────────────────────────────────────────

const BRIDGE_WA_JS: &str = include_str!("../../bridge/index.js");
const BRIDGE_WA_PKG: &str = include_str!("../../bridge/package.json");
const BRIDGE_TG_JS: &str = include_str!("../../bridge/telegram.js");

// ── Bridge state ─────────────────────────────────────────────────────────

pub struct BridgeState(pub Mutex<Option<Child>>);

// ── Config directory ───────────────────────────────────────────────────────

fn config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".config/nare")
}

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SetupStatus {
    pub claude_configured: bool,
    pub messenger_configured: bool,
}

// ── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn check_setup_status() -> SetupStatus {
    let dir = config_dir();
    SetupStatus {
        claude_configured: dir.join("credentials/claude").exists(),
        messenger_configured: dir.join("messenger_configured").exists(),
    }
}

/// Save the Anthropic API key securely.
#[tauri::command]
pub fn save_api_key(key: String) -> Result<(), String> {
    let creds_dir = config_dir().join("credentials");
    fs::create_dir_all(&creds_dir).map_err(|e| e.to_string())?;
    let path = creds_dir.join("claude");
    fs::write(&path, &key).map_err(|e| e.to_string())?;

    // chmod 600
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

/// Open embedded webview to claude.ai for login.
/// Uses both on_navigation and URL polling to detect post-login SPA navigations.
#[tauri::command]
pub async fn open_claude_login(app: AppHandle) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;

    if let Some(w) = app.get_webview_window("claude-login") {
        let _ = w.close();
    }

    let app_clone = app.clone();
    let _login_window = WebviewWindowBuilder::new(
        &app,
        "claude-login",
        tauri::WebviewUrl::External(
            "https://claude.ai/login".parse::<tauri::Url>().map_err(|e| e.to_string())?,
        ),
    )
    .title("Sign in with Claude")
    .inner_size(1000.0, 720.0)
    .center()
    .on_navigation(move |url| {
        if is_claude_post_login(url.as_str()) {
            handle_claude_login_success(&app_clone);
        }
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    // Poll URL every second for SPA pushState navigations
    let app_poll = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let Some(w) = app_poll.get_webview_window("claude-login") else {
                break;
            };
            if let Ok(url) = w.url() {
                if is_claude_post_login(url.as_str()) {
                    handle_claude_login_success(&app_poll);
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    let _ = w.close();
                    break;
                }
            }
        }
    });

    Ok(())
}

fn is_claude_post_login(url: &str) -> bool {
    url == "https://claude.ai/"
        || url.starts_with("https://claude.ai/new")
        || url.starts_with("https://claude.ai/chat/")
        || url.starts_with("https://claude.ai/project/")
}

fn handle_claude_login_success(app: &AppHandle) {
    let creds_dir = config_dir().join("credentials");
    let _ = fs::create_dir_all(&creds_dir);
    let _ = fs::write(creds_dir.join("claude"), "oauth:browser");
    let _ = app.emit("claude-auth-success", ());
}

// ── Telegram bridge ─────────────────────────────────────────────────────────

/// Start Telegram bridge. Zero npm dependencies — uses only Node.js built-in https.
#[tauri::command]
pub async fn start_telegram_bridge(app: AppHandle, token: String) -> Result<(), String> {
    use std::process::{Command, Stdio};
    use std::io::BufRead;

    kill_existing_bridge(&app)?;

    // Write telegram.js to config dir
    let bridge_dir = config_dir().join("bridge");
    fs::create_dir_all(&bridge_dir).map_err(|e| format!("Failed to create bridge dir: {e}"))?;
    let script = bridge_dir.join("telegram.js");
    fs::write(&script, BRIDGE_TG_JS).map_err(|e| format!("Failed to write telegram.js: {e}"))?;

    // Read API key if available
    let api_key = fs::read_to_string(config_dir().join("credentials/claude")).unwrap_or_default();

    // Spawn — no npm install needed, uses built-in https
    let mut child = Command::new("node")
        .arg(&script)
        .env("TELEGRAM_BOT_TOKEN", &token)
        .env("ANTHROPIC_API_KEY", api_key.trim())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Telegram bridge: {e}. Is Node.js installed?"))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Store child
    {
        let state = app.state::<BridgeState>();
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    // Read stdout — parse Telegram bridge events
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let trimmed = line.trim();
            if trimmed.is_empty() { continue; }

            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(trimmed) {
                match msg.get("event").and_then(|v| v.as_str()) {
                    Some("bot_info") => {
                        let username = msg.get("username").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let _ = app_clone.emit("tg-bot-info", username);
                    }
                    Some("waiting") => {
                        let _ = app_clone.emit("tg-waiting", ());
                    }
                    Some("ready") => {
                        let chat_id = msg.get("chatId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        write_messenger_config("telegram", &chat_id);
                        let _ = app_clone.emit("tg-connected", chat_id);
                    }
                    Some("message") => {
                        let from = msg.get("from").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let body = msg.get("body").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let _ = app_clone.emit("tg-message", format!("{from}:{body}"));
                    }
                    Some("error") => {
                        let message = msg.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error").to_string();
                        let _ = app_clone.emit("tg-error", message);
                    }
                    _ => {}
                }
            }
        }
    });

    // Stderr → log
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            eprintln!("[nare-telegram] {}", line);
        }
    });

    Ok(())
}

// ── WhatsApp bridge ─────────────────────────────────────────────────────────

/// Start WhatsApp bridge (Baileys). Requires npm install for dependencies.
#[tauri::command]
pub async fn start_wa_bridge(app: AppHandle) -> Result<(), String> {
    use std::process::{Command, Stdio};
    use std::io::BufRead;

    kill_existing_bridge(&app)?;

    // Extract embedded bridge files
    let bridge_dir = config_dir().join("bridge");
    fs::create_dir_all(&bridge_dir).map_err(|e| format!("Failed to create bridge dir: {e}"))?;
    fs::write(bridge_dir.join("index.js"), BRIDGE_WA_JS)
        .map_err(|e| format!("Failed to write index.js: {e}"))?;
    fs::write(bridge_dir.join("package.json"), BRIDGE_WA_PKG)
        .map_err(|e| format!("Failed to write package.json: {e}"))?;

    // Auto-install bridge dependencies if node_modules is missing
    if !bridge_dir.join("node_modules").exists() {
        let npm_status = Command::new("npm")
            .arg("install")
            .current_dir(&bridge_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .status()
            .map_err(|e| format!("Failed to run `npm install`: {e}"))?;

        if !npm_status.success() {
            return Err("Failed to install WhatsApp bridge dependencies.".into());
        }
    }

    let session_dir = config_dir().join("whatsapp/session");
    fs::create_dir_all(&session_dir).map_err(|e| e.to_string())?;

    let mut child = Command::new("node")
        .arg(bridge_dir.join("index.js"))
        .env("WA_SESSION_DIR", session_dir.to_string_lossy().as_ref())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start WhatsApp bridge: {e}. Is Node.js installed?"))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    {
        let state = app.state::<BridgeState>();
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let trimmed = line.trim();
            if trimmed.is_empty() { continue; }

            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(trimmed) {
                match msg.get("event").and_then(|v| v.as_str()) {
                    Some("qr") => {
                        if let Some(data) = msg.get("data").and_then(|v| v.as_str()) {
                            let _ = app_clone.emit("wa-qr", data.to_string());
                        }
                    }
                    Some("ready") => {
                        let phone = msg.get("phone").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        write_messenger_config("whatsapp", &phone);
                        let _ = app_clone.emit("wa-authenticated", phone);
                    }
                    Some("disconnected") => {
                        let _ = app_clone.emit("wa-disconnected", ());
                    }
                    _ => {}
                }
            }
        }
    });

    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            eprintln!("[nare-bridge] {}", line);
        }
    });

    Ok(())
}

/// Stop the running bridge process (WhatsApp or Telegram).
#[tauri::command]
pub fn stop_bridge(app: AppHandle) -> Result<(), String> {
    kill_existing_bridge(&app)
}

/// Enable and start the systemd user services after setup is complete.
#[tauri::command]
pub async fn start_services() -> Result<(), String> {
    use std::process::Command;

    for args in [
        &["--user", "enable", "--now", "nare-agent.service"][..],
        &["--user", "enable", "--now", "nare-wa-bridge.service"][..],
    ] {
        Command::new("systemctl")
            .args(args)
            .status()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn kill_existing_bridge(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<BridgeState>();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        if let Some(ref mut stdin) = child.stdin {
            let _ = stdin.write_all(b"{\"command\":\"stop\"}\n");
        }
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

fn write_messenger_config(messenger: &str, id: &str) {
    let dir = config_dir();
    let _ = fs::create_dir_all(&dir);

    // Mark messenger as configured
    let _ = fs::write(dir.join("messenger_configured"), messenger);

    let content = match messenger {
        "telegram" => format!(
            r#"[ai_agent]
enabled          = true
provider         = "claude"
claude_mode      = "oauth"
messenger        = "telegram"
language         = "auto"
safe_mode        = true

[telegram]
chat_id          = "{id}"
session_timeout  = 3600
"#
        ),
        _ => {
            let allowed = if id.is_empty() {
                String::new()
            } else {
                format!("allowed_numbers = [\"+{id}\"]")
            };
            format!(
                r#"[ai_agent]
enabled          = true
provider         = "claude"
claude_mode      = "oauth"
messenger        = "whatsapp"
language         = "auto"
safe_mode        = true

[whatsapp]
{allowed}
require_prefix   = false
session_timeout  = 3600
"#
            )
        }
    };

    let _ = fs::write(dir.join("config.toml"), content);
}
