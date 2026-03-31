mod crypto;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            crypto::encrypt_secret,
            crypto::decrypt_secret,
            commands::run_command,
            commands::glob_files,
            commands::grep_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
