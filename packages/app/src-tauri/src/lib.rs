// Phase0: 最小 Tauri shell — 无自定义 commands/plugins
// Phase5+ 在此添加: tauri::generate_handler![...] + plugins

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
