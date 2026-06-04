mod commands;
mod fs_ops;
mod global_hotkey;
mod model;
mod path_security;
mod safe_fs;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_linux_webview_environment();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::configure_global_reveal_shortcut,
            commands::initial_open_file,
            commands::read_markdown_file,
            commands::reveal_window,
            commands::write_markdown_file,
            commands::write_export_file,
            commands::import_editor_asset,
            commands::import_editor_asset_from_path,
            commands::read_local_asset_data_url,
            commands::init_vault,
            commands::read_vault_directory,
            commands::read_vault_index_files,
            commands::create_vault_entry,
            commands::rename_vault_entry,
            commands::delete_vault_entry,
            commands::write_vault_workspace_state,
            commands::open_external_target,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Serein Desktop");
}

#[cfg(target_os = "linux")]
fn configure_linux_webview_environment() {
    // WSLg can spend several seconds probing EGL/Zink before WebKit renders.
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
}

#[cfg(not(target_os = "linux"))]
fn configure_linux_webview_environment() {}
