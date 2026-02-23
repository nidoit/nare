mod commands;

use commands::{check_setup_status, open_claude_login, start_services, start_wa_bridge};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_setup_status,
            open_claude_login,
            start_wa_bridge,
            start_services,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NARE");
}
