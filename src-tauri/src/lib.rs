use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

type SidecarHandle = std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let (mut rx, child) = app
        .shell()
        .sidecar("cas-analyzer-backend")
        .expect("failed to create sidecar command")
        .spawn()
        .expect("failed to spawn backend sidecar");

      app.manage::<SidecarHandle>(std::sync::Mutex::new(Some(child)));

      tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
          match event {
            CommandEvent::Stdout(line) => log::info!("[backend] {}", String::from_utf8_lossy(&line)),
            CommandEvent::Stderr(line) => log::info!("[backend] {}", String::from_utf8_lossy(&line)),
            CommandEvent::Error(err) => log::error!("[backend] error: {}", err),
            CommandEvent::Terminated(payload) => {
              log::warn!("[backend] exited: {:?}", payload);
              break;
            }
            _ => {}
          }
        }
      });

      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::Destroyed = event {
        if let Some(state) = window.app_handle().try_state::<SidecarHandle>() {
          if let Some(child) = state.lock().unwrap().take() {
            let _ = child.kill();
          }
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
