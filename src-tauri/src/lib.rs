mod commands;

use commands::{
    check_setup_status, open_claude_login, save_api_key, reset_setup,
    get_config_info, start_services,
    start_wa_bridge, start_telegram_bridge, stop_bridge,
    BridgeState,
};
use std::io::Write;
use std::process::Child;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(BridgeState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            check_setup_status,
            open_claude_login,
            save_api_key,
            reset_setup,
            get_config_info,
            start_wa_bridge,
            start_telegram_bridge,
            stop_bridge,
            start_services,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    if let Some(state) = window.try_state::<BridgeState>() {
                        if let Ok(mut guard) = state.0.lock() {
                            let opt: &mut Option<Child> = &mut *guard;
                            if let Some(mut child) = opt.take() {
                                if let Some(ref mut stdin) = child.stdin {
                                    let _ = stdin.write_all(b"{\"command\":\"stop\"}\n");
                                }
                                let _ = child.kill();
                                let _ = child.wait();
                            }
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running NARE");
}
