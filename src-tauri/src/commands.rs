use std::fs;
use std::io::Write as _;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// ── Embedded bridge source ──────────────────────────────────────────────────

/// Bridge JavaScript and package.json are embedded at compile time.
/// They get extracted to ~/.config/nare/bridge/ on first use.
const BRIDGE_INDEX_JS: &str = include_str!("../../bridge/index.js");
const BRIDGE_PACKAGE_JSON: &str = include_str!("../../bridge/package.json");

// ── Bridge state ─────────────────────────────────────────────────────────

/// Holds the running bridge child process so we can prevent duplicate spawns
/// and kill it cleanly when the app exits.
pub struct BridgeState(pub Mutex<Option<Child>>);

// ── Config directory ───────────────────────────────────────────────────────

fn config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".config/nare")
}

/// Ensure the bridge source files exist at ~/.config/nare/bridge/.
/// Writes the embedded index.js and package.json if missing or outdated.
fn ensure_bridge_extracted() -> Result<PathBuf, String> {
    let bridge_dir = config_dir().join("bridge");
    fs::create_dir_all(&bridge_dir)
        .map_err(|e| format!("Failed to create bridge dir: {e}"))?;

    let index_path = bridge_dir.join("index.js");
    let pkg_path = bridge_dir.join("package.json");

    // Always overwrite to keep in sync with the binary version
    fs::write(&index_path, BRIDGE_INDEX_JS)
        .map_err(|e| format!("Failed to write bridge/index.js: {e}"))?;
    fs::write(&pkg_path, BRIDGE_PACKAGE_JSON)
        .map_err(|e| format!("Failed to write bridge/package.json: {e}"))?;

    Ok(bridge_dir)
}

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SetupStatus {
    pub claude_configured: bool,
    pub wa_configured: bool,
}

// ── Commands ───────────────────────────────────────────────────────────────

/// Check whether Claude and WhatsApp credentials exist.
#[tauri::command]
pub fn check_setup_status() -> SetupStatus {
    let dir = config_dir();
    SetupStatus {
        claude_configured: dir.join("credentials/claude").exists(),
        wa_configured: dir.join("whatsapp/session/creds.json").exists(),
    }
}

/// Open an embedded webview window pointing at claude.ai so the user can log
/// in with their Claude Pro/Max account.  When a successful post-login URL is
/// detected, the credentials marker is written and a `claude-auth-success`
/// event is emitted to all windows.
///
/// Detection uses both `on_navigation` (for real page navigations) and URL
/// polling (for SPA/pushState navigations that don't trigger on_navigation).
#[tauri::command]
pub async fn open_claude_login(app: AppHandle) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;

    // Close any existing login window
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

    // Poll the webview URL every second to catch SPA (pushState) navigations
    // that don't trigger on_navigation.
    let app_poll = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));

            let Some(w) = app_poll.get_webview_window("claude-login") else {
                break; // Window was closed
            };

            if let Ok(url) = w.url() {
                if is_claude_post_login(url.as_str()) {
                    handle_claude_login_success(&app_poll);
                    // Close after a short delay
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    let _ = w.close();
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Check if a URL indicates the user has successfully logged into claude.ai.
fn is_claude_post_login(url: &str) -> bool {
    url == "https://claude.ai/"
        || url.starts_with("https://claude.ai/new")
        || url.starts_with("https://claude.ai/chat/")
        || url.starts_with("https://claude.ai/project/")
}

/// Write credentials marker and emit success event.
fn handle_claude_login_success(app: &AppHandle) {
    let creds_dir = config_dir().join("credentials");
    let _ = fs::create_dir_all(&creds_dir);
    let _ = fs::write(creds_dir.join("claude"), "oauth:browser");
    let _ = app.emit("claude-auth-success", ());
}

/// Spawn the WhatsApp bridge using Baileys (via `node bridge/index.js`).
/// Installs bridge npm dependencies automatically if missing.
/// Bridge output lines are JSON events; we parse them and emit Tauri events.
/// The child process is stored in BridgeState to prevent duplicates and enable cleanup.
#[tauri::command]
pub async fn start_wa_bridge(app: AppHandle) -> Result<(), String> {
    use std::process::{Command, Stdio};
    use std::io::BufRead;

    let state = app.state::<BridgeState>();

    // Kill any existing bridge before starting a new one
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            // Send stop command via stdin, then kill
            if let Some(ref mut stdin) = child.stdin {
                let _ = stdin.write_all(b"{\"command\":\"stop\"}\n");
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    let bridge_dir = ensure_bridge_extracted()?;
    let bridge_script = bridge_dir.join("index.js");

    // Auto-install bridge dependencies if node_modules is missing
    if !bridge_dir.join("node_modules").exists() {
        let npm_status = Command::new("npm")
            .arg("install")
            .current_dir(&bridge_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .status()
            .map_err(|e| format!("Failed to run `npm install` in bridge/: {e}"))?;

        if !npm_status.success() {
            return Err("Failed to install bridge dependencies. Run `cd bridge && npm install` manually.".into());
        }
    }

    // Ensure session directory exists
    let session_dir = config_dir().join("whatsapp/session");
    fs::create_dir_all(&session_dir).map_err(|e| e.to_string())?;

    // Spawn `node bridge/index.js`
    let mut child = Command::new("node")
        .arg(&bridge_script)
        .env("WA_SESSION_DIR", session_dir.to_string_lossy().as_ref())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start bridge: {e}. Is Node.js installed?"))?;

    let stdout = child.stdout.take().ok_or("Failed to capture bridge stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture bridge stderr")?;

    // Store child in state (stdin stays with the Child for later command sending)
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    // Read stdout in background thread — parse JSON events
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
                        let phone = msg
                            .get("phone")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        write_config(&phone);
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

    // Read stderr in background thread — log bridge errors
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            eprintln!("[nare-bridge] {}", line);
        }
    });

    Ok(())
}

/// Stop the running WhatsApp bridge process.
#[tauri::command]
pub fn stop_wa_bridge(app: AppHandle) -> Result<(), String> {
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

fn write_config(phone: &str) {
    let dir = config_dir();
    let _ = fs::create_dir_all(&dir);

    let allowed = if phone.is_empty() {
        String::new()
    } else {
        format!("allowed_numbers = [\"+{phone}\"]")
    };

    let content = format!(
        r#"[ai_agent]
enabled          = true
provider         = "claude"
claude_mode      = "oauth"
whatsapp_enabled = true
language         = "auto"
safe_mode        = true

[whatsapp]
library          = "baileys"
{allowed}
require_prefix   = false
session_timeout  = 3600
"#
    );

    let _ = fs::write(dir.join("config.toml"), content);
}
