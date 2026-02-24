use std::fs;
use std::io::Write as _;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

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

/// Locate the bridge/ directory containing index.js.
/// Search order:
///   1. Dev mode: CARGO_MANIFEST_DIR/../bridge/  (baked in at compile time)
///   2. Installed (FHS): <exe>/../share/nare/bridge/  (/usr/local/share/nare/bridge/)
///   3. CWD: ./bridge/  (running from project root)
fn find_bridge_dir() -> Option<PathBuf> {
    // 1. Dev mode — CARGO_MANIFEST_DIR is resolved at compile time
    //    e.g. /home/user/nare/src-tauri → /home/user/nare/bridge
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../bridge");
    if dev.join("index.js").exists() {
        return Some(dev);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // 2. FHS installed: /usr/local/bin/nare → /usr/local/share/nare/bridge/
            let fhs = exe_dir.join("../share/nare/bridge");
            if fhs.join("index.js").exists() {
                return Some(fhs);
            }
        }
    }

    // 3. CWD fallback: ./bridge/ (running from project root)
    let cwd = PathBuf::from("bridge");
    if cwd.join("index.js").exists() {
        return Some(cwd);
    }

    None
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
        let url_str = url.as_str();
        let is_post_login = url_str == "https://claude.ai/"
            || url_str.starts_with("https://claude.ai/new")
            || url_str.starts_with("https://claude.ai/chat/")
            || url_str.starts_with("https://claude.ai/project/");

        if is_post_login {
            // Write credentials marker (OAuth token managed by claude CLI / browser)
            let creds_dir = config_dir().join("credentials");
            let _ = fs::create_dir_all(&creds_dir);
            let _ = fs::write(creds_dir.join("claude"), "oauth:browser");

            // Emit success event to React frontend
            let _ = app_clone.emit("claude-auth-success", ());

            // Close the login window after a short delay so the user sees the redirect
            if let Some(w) = app_clone.get_webview_window("claude-login") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    let _ = w.close();
                });
            }
        }

        // Allow all navigations
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
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

    let bridge_dir = find_bridge_dir().ok_or_else(|| {
        "WhatsApp bridge not found. Searched:\n  \
         - bridge/ (dev mode)\n  \
         - ../share/nare/bridge/ (installed)\n\
         Make sure NARE is properly installed or run from the project root."
            .to_string()
    })?;
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
