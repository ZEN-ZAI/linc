#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_writer(std::io::stderr)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Only launch the bundled server binary in release builds.
            // In dev, Express is started separately via `npm run tauri:dev`.
            #[cfg(not(debug_assertions))]
            {
                use std::net::{SocketAddr, TcpStream};
                use std::time::Duration;
                use tauri::Manager;
                use tauri_plugin_shell::ShellExt;

                let child = _app
                    .shell()
                    .sidecar("server")
                    .expect("failed to create server sidecar")
                    .spawn()
                    .expect("failed to spawn server sidecar");
                _app.manage(child);

                // Wait for the server to be ready before the window loads.
                let addr: SocketAddr = "127.0.0.1:3001".parse().unwrap();
                for _ in 0..100 {
                    if TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running linc");
}
