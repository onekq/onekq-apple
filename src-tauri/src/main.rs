#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let model_id = backend::get_model_variant();
            println!("🧠 Auto-detected model: {}", model_id);

            match backend::start_model_server(model_id.clone(), app.handle()) {
                Ok(port) => println!("✅ Model server launched on port: {}", port),
                Err(e) => eprintln!("❌ Failed to start model server: {}", e),
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backend::get_model_variant,
            backend::start_model_server
        ])
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                backend::stop_model_server();
            }
        })
        .run(tauri::generate_context!())
        .expect("❌ error while running tauri application");
}
