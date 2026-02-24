use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

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

/// Spawn the nare-bridge sidecar for the chosen WhatsApp library.
/// `library` is either `"baileys"` or `"whatsapp-web-js"`.
/// Bridge output lines are JSON events; we parse them and emit Tauri events.
#[tauri::command]
pub async fn start_wa_bridge(app: AppHandle, library: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    use tauri_plugin_shell::process::CommandEvent;

    // Validate library choice
    if library != "baileys" && library != "whatsapp-web-js" {
        return Err(format!("Unknown WhatsApp library: {library}"));
    }

    // Persist the library choice to config
    save_wa_library(&library);

    // Ensure session directory exists
    let session_dir = config_dir().join("whatsapp/session");
    fs::create_dir_all(&session_dir).map_err(|e| e.to_string())?;

    // Select the sidecar binary based on library choice
    let sidecar_name = match library.as_str() {
        "whatsapp-web-js" => "nare-bridge-wwjs",
        _ => "nare-bridge",
    };

    let (mut rx, _child) = app
        .shell()
        .sidecar(sidecar_name)
        .map_err(|e| e.to_string())?
        .env("WA_SESSION_DIR", session_dir.to_string_lossy().as_ref())
        .spawn()
        .map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
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
                CommandEvent::Stderr(bytes) => {
                    eprintln!("[nare-bridge] {}", String::from_utf8_lossy(&bytes));
                }
                _ => {}
            }
        }
    });

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

/// Persist the selected WhatsApp library to config so write_config can include it.
fn save_wa_library(library: &str) {
    let dir = config_dir();
    let _ = fs::create_dir_all(&dir);
    let _ = fs::write(dir.join("whatsapp_library"), library);
}

/// Read the previously selected WhatsApp library (defaults to "baileys").
fn read_wa_library() -> String {
    let path = config_dir().join("whatsapp_library");
    fs::read_to_string(path).unwrap_or_else(|_| "baileys".to_string())
}

fn write_config(phone: &str) {
    let dir = config_dir();
    let _ = fs::create_dir_all(&dir);

    let library = read_wa_library();

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
library          = "{library}"
{allowed}
require_prefix   = false
session_timeout  = 3600
"#
    );

    let _ = fs::write(dir.join("config.toml"), content);
}
