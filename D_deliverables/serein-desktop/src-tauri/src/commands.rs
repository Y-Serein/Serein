use crate::{
    clipboard,
    fs_ops,
    global_hotkey,
    model::{
        ImportedAsset, LocalAssetData, MarkdownFile, VaultDirectory, VaultIndexResponse,
        VaultInitResponse, VaultWorkspaceState,
    },
    path_security::{ensure_supported_text_path, is_supported_text_path},
    vault,
};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<MarkdownFile, String> {
    fs_ops::read_markdown_file(path)
}

#[tauri::command]
pub fn initial_open_file() -> Result<Option<String>, String> {
    for argument in std::env::args_os().skip(1) {
        let path = PathBuf::from(argument);
        if !path.exists() || !path.is_file() || !is_supported_text_path(&path) {
            continue;
        }

        let resolved = fs::canonicalize(&path).unwrap_or(path);
        let Some(path_string) = resolved.to_str() else {
            return Err("Startup file path is not valid UTF-8.".to_string());
        };
        ensure_supported_text_path(path_string)?;
        return Ok(Some(path_string.to_string()));
    }

    Ok(None)
}

#[tauri::command]
pub fn configure_global_reveal_shortcut(app: AppHandle, shortcut: Option<String>) -> Result<(), String> {
    global_hotkey::configure_global_reveal_shortcut(app, shortcut)
}

#[tauri::command]
pub fn configure_global_quick_note_shortcut(
    app: AppHandle,
    shortcut: Option<String>,
    show_in_taskbar: bool,
    initial_surface: Option<global_hotkey::QuickNoteInitialSurface>,
) -> Result<(), String> {
    global_hotkey::configure_global_quick_note_shortcut(app, shortcut, show_in_taskbar, initial_surface)
}

#[tauri::command]
pub fn open_quick_note_window(
    app: AppHandle,
    show_in_taskbar: bool,
    initial_surface: Option<global_hotkey::QuickNoteInitialSurface>,
) -> Result<String, String> {
    global_hotkey::open_quick_note_window(&app, show_in_taskbar, initial_surface)
}

#[tauri::command]
pub fn reveal_window(app: AppHandle) -> Result<(), String> {
    global_hotkey::reveal_window(&app)
}

#[tauri::command]
pub fn hide_main_window_to_tray(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Serein window not found.".to_string())?;
    window
        .hide()
        .map_err(|error| format!("Failed to hide Serein window: {error}"))
}

#[tauri::command]
pub fn desktop_read_clipboard_text() -> Result<String, String> {
    clipboard::read_text()
}

#[tauri::command]
pub fn desktop_write_clipboard_text(text: String) -> Result<(), String> {
    clipboard::write_text(&text)
}

#[tauri::command]
pub fn write_markdown_file(
    app: AppHandle,
    path: String,
    content: String,
    expected_modified_at_ms: Option<u64>,
    expected_size: Option<u64>,
) -> Result<MarkdownFile, String> {
    let backup_root = app_data_dir(&app)?.join("backups");
    fs_ops::write_markdown_file(path, content, expected_modified_at_ms, expected_size, backup_root)
}

#[tauri::command]
pub fn write_export_file(path: String, format: String, bytes: Vec<u8>) -> Result<(), String> {
    fs_ops::write_export_file(path, format, bytes)
}

#[tauri::command]
pub fn import_editor_asset(
    vault_root: Option<String>,
    current_file_path: String,
    file_name: String,
    bytes: Vec<u8>,
    attachment_folder: Option<String>,
) -> Result<ImportedAsset, String> {
    fs_ops::import_editor_asset(vault_root, current_file_path, file_name, bytes, attachment_folder)
}

#[tauri::command]
pub fn import_editor_asset_from_path(
    vault_root: Option<String>,
    current_file_path: String,
    source_path: String,
    attachment_folder: Option<String>,
) -> Result<ImportedAsset, String> {
    fs_ops::import_editor_asset_from_path(vault_root, current_file_path, source_path, attachment_folder)
}

#[tauri::command]
pub fn read_local_asset_data_url(
    vault_root: Option<String>,
    current_file_path: String,
    source: String,
) -> Result<LocalAssetData, String> {
    fs_ops::read_local_asset_data_url(vault_root, current_file_path, source)
}

#[tauri::command]
pub fn init_vault(app: AppHandle, root: String) -> Result<VaultInitResponse, String> {
    vault::init_vault(root, app_data_dir(&app)?)
}

#[tauri::command]
pub fn read_vault_directory(
    root: String,
    relative_path: String,
    limit: Option<usize>,
) -> Result<VaultDirectory, String> {
    vault::read_vault_directory(root, relative_path, limit)
}

#[tauri::command]
pub fn read_vault_index_files(root: String) -> Result<VaultIndexResponse, String> {
    vault::read_vault_index_files(root)
}

#[tauri::command]
pub fn search_vault_tag_files(
    root: String,
    query: String,
    limit: Option<usize>,
) -> Result<VaultIndexResponse, String> {
    vault::search_vault_tag_files(root, query, limit)
}

#[tauri::command]
pub fn create_vault_entry(
    root: String,
    relative_path: String,
    kind: String,
) -> Result<String, String> {
    vault::create_vault_entry(root, relative_path, kind)
}

#[tauri::command]
pub fn rename_vault_entry(
    root: String,
    relative_path: String,
    new_name: String,
) -> Result<String, String> {
    vault::rename_vault_entry(root, relative_path, new_name)
}

#[tauri::command]
pub fn delete_vault_entry(app: AppHandle, root: String, relative_path: String) -> Result<(), String> {
    vault::delete_vault_entry(root, relative_path, app_data_dir(&app)?)
}

#[tauri::command]
pub fn write_vault_workspace_state(
    app: AppHandle,
    root: String,
    workspace: VaultWorkspaceState,
) -> Result<(), String> {
    vault::write_workspace_state(root, workspace, app_data_dir(&app)?)
}

#[tauri::command]
pub fn open_external_target(target: String) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() || target.contains('\0') {
        return Err("invalid link target".to_string());
    }

    if is_probable_local_path(target) && !Path::new(target).exists() {
        return Err("local link target does not exist".to_string());
    }

    platform_open(target)
        .map_err(|error| format!("failed to open link target: {error}"))?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn platform_open(target: &str) -> std::io::Result<()> {
    Command::new("xdg-open").arg(target).spawn().map(|_| ())
}

#[cfg(target_os = "macos")]
fn platform_open(target: &str) -> std::io::Result<()> {
    Command::new("open").arg(target).spawn().map(|_| ())
}

#[cfg(target_os = "windows")]
fn platform_open(target: &str) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    if is_probable_local_path(target) && Path::new(target).is_dir() {
        let explorer_target = windows_explorer_path(target);
        return Command::new("explorer.exe")
            .arg(explorer_target)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ());
    }

    Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", target])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
}

#[cfg(target_os = "windows")]
fn windows_explorer_path(target: &str) -> String {
    if let Some(rest) = target.strip_prefix("//") {
        return format!("\\\\{}", rest.replace('/', "\\"));
    }

    target.replace('/', "\\")
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn platform_open(_target: &str) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "opening links is not supported on this platform",
    ))
}

fn is_probable_local_path(target: &str) -> bool {
    if target.starts_with('/') || target.starts_with("\\\\") {
        return true;
    }

    let bytes = target.as_bytes();
    if bytes.len() >= 3 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        return true;
    }

    !has_url_scheme(target)
}

fn has_url_scheme(target: &str) -> bool {
    let Some(colon_index) = target.find(':') else {
        return false;
    };
    if colon_index == 1 && target.as_bytes()[0].is_ascii_alphabetic() {
        return false;
    }

    let scheme = &target[..colon_index];
    let mut chars = scheme.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_alphabetic()
        && chars.all(|character| character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.'))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve Serein app data directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Serein app data directory: {error}"))?;
    Ok(dir)
}
