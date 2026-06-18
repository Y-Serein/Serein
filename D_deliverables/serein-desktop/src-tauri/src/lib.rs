mod clipboard;
mod commands;
mod fs_ops;
mod global_hotkey;
mod model;
mod path_security;
mod safe_fs;
mod vault;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter,
    Manager,
};

const TRAY_OPEN_MENU_ID: &str = "serein-tray-open";
const TRAY_EXIT_MENU_ID: &str = "serein-tray-exit";
const TRAY_EXIT_REQUESTED_EVENT: &str = "serein-tray-exit-requested";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_linux_webview_environment();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::configure_global_quick_note_shortcut,
            commands::configure_global_reveal_shortcut,
            commands::desktop_read_clipboard_text,
            commands::desktop_write_clipboard_text,
            commands::hide_main_window_to_tray,
            commands::initial_open_file,
            commands::open_quick_note_window,
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
            commands::search_vault_tag_files,
            commands::create_vault_entry,
            commands::rename_vault_entry,
            commands::delete_vault_entry,
            commands::write_vault_workspace_state,
            commands::open_external_target,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Serein Desktop");
}

fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, TRAY_OPEN_MENU_ID, "打开 Serein", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit_item = MenuItem::with_id(app, TRAY_EXIT_MENU_ID, "退出 Serein", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &separator, &exit_item])?;

    let mut builder = TrayIconBuilder::with_id("serein-tray")
        .tooltip("Serein")
        .menu(&menu)
        .show_menu_on_left_click(false);

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder
        .on_menu_event(|app, event| {
            if event.id() == TRAY_OPEN_MENU_ID {
                reveal_main_window(app);
            } else if event.id() == TRAY_EXIT_MENU_ID {
                request_main_window_exit(app);
            }
        })
        .on_tray_icon_event(|tray, event| {
            let should_reveal = matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            );
            if !should_reveal {
                return;
            }

            reveal_main_window(tray.app_handle());
        })
        .build(app)?;
    Ok(())
}

fn reveal_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn request_main_window_exit(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit(TRAY_EXIT_REQUESTED_EVENT, ());
    }
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
