#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Only launch the bundled server binary in release builds.
            // In dev, Express is started separately via `npm run tauri:dev`.
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                use tauri_plugin_shell::ShellExt;
                let child = _app
                    .shell()
                    .sidecar("server")
                    .expect("failed to create server sidecar")
                    .spawn()
                    .expect("failed to spawn server sidecar");
                _app.manage(child);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running linc");
}
