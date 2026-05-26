use crate::{
    fs_ops,
    model::{
        ImportedAsset, LocalAssetData, MarkdownFile, VaultDirectory, VaultIndexResponse, VaultInitResponse,
        VaultWorkspaceState,
    },
    vault,
};
use std::{path::Path, process::Command};

#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<MarkdownFile, String> {
    fs_ops::read_markdown_file(path)
}

#[tauri::command]
pub fn write_markdown_file(
    path: String,
    content: String,
    expected_modified_at_ms: Option<u64>,
    expected_size: Option<u64>,
) -> Result<MarkdownFile, String> {
    fs_ops::write_markdown_file(path, content, expected_modified_at_ms, expected_size)
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
) -> Result<ImportedAsset, String> {
    fs_ops::import_editor_asset(vault_root, current_file_path, file_name, bytes)
}

#[tauri::command]
pub fn import_editor_asset_from_path(
    vault_root: Option<String>,
    current_file_path: String,
    source_path: String,
) -> Result<ImportedAsset, String> {
    fs_ops::import_editor_asset_from_path(vault_root, current_file_path, source_path)
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
pub fn init_vault(root: String) -> Result<VaultInitResponse, String> {
    vault::init_vault(root)
}

#[tauri::command]
pub fn read_vault_directory(root: String, relative_path: String, limit: Option<usize>) -> Result<VaultDirectory, String> {
    vault::read_vault_directory(root, relative_path, limit)
}

#[tauri::command]
pub fn read_vault_index_files(root: String) -> Result<VaultIndexResponse, String> {
    vault::read_vault_index_files(root)
}

#[tauri::command]
pub fn create_vault_entry(root: String, relative_path: String, kind: String) -> Result<String, String> {
    vault::create_vault_entry(root, relative_path, kind)
}

#[tauri::command]
pub fn rename_vault_entry(root: String, relative_path: String, new_name: String) -> Result<String, String> {
    vault::rename_vault_entry(root, relative_path, new_name)
}

#[tauri::command]
pub fn delete_vault_entry(root: String, relative_path: String) -> Result<(), String> {
    vault::delete_vault_entry(root, relative_path)
}

#[tauri::command]
pub fn write_vault_workspace_state(root: String, workspace: VaultWorkspaceState) -> Result<(), String> {
    vault::write_workspace_state(root, workspace)
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

    Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", target])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
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
