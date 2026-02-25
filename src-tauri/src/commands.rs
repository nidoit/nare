use std::fs;
use std::io::Write as _;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// ── Embedded bridge source ──────────────────────────────────────────────────

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
    let claude_configured = dir.join("credentials/claude").exists()
        || dir.join("credentials/deepseek").exists();
    SetupStatus {
        claude_configured,
        messenger_configured: dir.join("messenger_configured").exists(),
    }
}

/// Save a DeepSeek API key securely.
#[tauri::command]
pub fn save_api_key(provider: String, key: String) -> Result<(), String> {
    let creds_dir = config_dir().join("credentials");
    fs::create_dir_all(&creds_dir).map_err(|e| e.to_string())?;

    let path = creds_dir.join("deepseek");
    fs::write(&path, &key).map_err(|e| e.to_string())?;

    // Store the chosen provider
    fs::write(creds_dir.join("provider"), &provider).map_err(|e| e.to_string())?;

    // chmod 600
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

/// Save provider choice (used when Claude OAuth login succeeds).
#[tauri::command]
pub fn save_provider_choice(provider: String) -> Result<(), String> {
    let creds_dir = config_dir().join("credentials");
    fs::create_dir_all(&creds_dir).map_err(|e| e.to_string())?;
    fs::write(creds_dir.join("provider"), &provider).map_err(|e| e.to_string())?;
    Ok(())
}

/// Reset all setup state so the wizard runs again.
#[tauri::command]
pub fn reset_setup() -> Result<(), String> {
    let dir = config_dir();
    let _ = fs::remove_file(dir.join("credentials/claude"));
    let _ = fs::remove_file(dir.join("credentials/deepseek"));
    let _ = fs::remove_file(dir.join("credentials/provider"));
    let _ = fs::remove_file(dir.join("messenger_configured"));
    let _ = fs::remove_file(dir.join("config.toml"));
    Ok(())
}

/// Get current configuration info for the settings view.
#[tauri::command]
pub fn get_config_info() -> ConfigInfo {
    let dir = config_dir();

    let provider = fs::read_to_string(dir.join("credentials/provider"))
        .unwrap_or_default()
        .trim()
        .to_string();

    let api_key_set = match provider.as_str() {
        "deepseek" => dir.join("credentials/deepseek").exists()
            && fs::read_to_string(dir.join("credentials/deepseek"))
                .map(|k| k.trim().starts_with("sk-"))
                .unwrap_or(false),
        "claude" => dir.join("credentials/claude").exists(),
        _ => false,
    };

    let messenger = fs::read_to_string(dir.join("messenger_configured"))
        .unwrap_or_default()
        .trim()
        .to_string();

    ConfigInfo {
        api_key_set,
        provider: if provider.is_empty() { None } else { Some(provider) },
        messenger: if messenger.is_empty() { None } else { Some(messenger) },
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigInfo {
    pub api_key_set: bool,
    pub provider: Option<String>,
    pub messenger: Option<String>,
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

    // Read provider and API key
    let provider = fs::read_to_string(config_dir().join("credentials/provider"))
        .unwrap_or_else(|_| "deepseek".to_string());
    let provider = provider.trim().to_string();

    let api_key = match provider.as_str() {
        "deepseek" => fs::read_to_string(config_dir().join("credentials/deepseek")).unwrap_or_default(),
        _ => String::new(),
    };

    // Spawn — no npm install needed, uses built-in https
    let mut child = Command::new("node")
        .arg(&script)
        .env("TELEGRAM_BOT_TOKEN", &token)
        .env("AI_PROVIDER", &provider)
        .env("DEEPSEEK_API_KEY", if provider == "deepseek" { api_key.trim() } else { "" })
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
                        write_messenger_config(&chat_id);
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

/// Stop the running bridge process.
#[tauri::command]
pub fn stop_bridge(app: AppHandle) -> Result<(), String> {
    kill_existing_bridge(&app)
}

/// Enable and start the systemd user services after setup is complete.
#[tauri::command]
pub async fn start_services() -> Result<(), String> {
    use std::process::Command;

    Command::new("systemctl")
        .args(["--user", "enable", "--now", "nare-agent.service"])
        .status()
        .map_err(|e| e.to_string())?;
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

fn write_messenger_config(chat_id: &str) {
    let dir = config_dir();
    let _ = fs::create_dir_all(&dir);

    // Mark messenger as configured
    let _ = fs::write(dir.join("messenger_configured"), "telegram");

    // Read chosen AI provider
    let provider = fs::read_to_string(dir.join("credentials/provider"))
        .unwrap_or_else(|_| "deepseek".to_string());
    let provider = provider.trim();

    let content = format!(
        r#"[ai_agent]
enabled          = true
provider         = "{provider}"
messenger        = "telegram"
language         = "auto"
safe_mode        = true

[telegram]
chat_id          = "{chat_id}"
session_timeout  = 3600
"#
    );

    let _ = fs::write(dir.join("config.toml"), content);
}
