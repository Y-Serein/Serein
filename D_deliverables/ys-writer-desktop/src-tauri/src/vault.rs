use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{
    model::{
        VaultConfig, VaultDirectory, VaultIndexFile, VaultIndexResponse, VaultInitResponse,
        VaultLayoutState, VaultObsidianSettings, VaultTreeEntry, VaultWorkspaceState,
    },
    path_security::{
        ensure_path_inside_root, ensure_supported_text_path, is_supported_text_path,
        normalized_extension, resolve_vault_path, should_skip_directory, to_slash_path,
    },
    safe_fs::{atomic_write, timestamp_ms},
};

const LEGACY_SEREIN_DIR: &str = ".serein";
const APP_VAULTS_DIR: &str = "vaults";
const VAULT_CONFIG: &str = "vault.json";
const WORKSPACE_CONFIG: &str = "workspace.json";
const TRASH_DIR: &str = "trash";
const INDEX_FILE_LIMIT: usize = 2000;
const INDEX_FILE_SIZE_LIMIT: u64 = 1024 * 1024;
const INDEX_TOTAL_CONTENT_LIMIT: u64 = 32 * 1024 * 1024;

pub fn init_vault(root: String, app_data_root: PathBuf) -> Result<VaultInitResponse, String> {
    let root_path = fs::canonicalize(&root)
        .map_err(|error| format!("Failed to resolve vault root: {error}"))?;
    if !root_path.is_dir() {
        return Err("Vault root is not a directory.".to_string());
    }

    let serein_dir = vault_metadata_dir(&app_data_root, &root_path);
    fs::create_dir_all(&serein_dir)
        .map_err(|error| format!("Failed to create Serein metadata directory: {error}"))?;

    let config_path = serein_dir.join(VAULT_CONFIG);
    let workspace_path = serein_dir.join(WORKSPACE_CONFIG);
    migrate_legacy_metadata(&root_path, &config_path, &workspace_path)?;
    let config = read_or_create_vault_config(&root_path, &config_path)?;
    let workspace = read_or_create_workspace_state(&workspace_path)?;

    Ok(VaultInitResponse {
        root: root_path.to_string_lossy().to_string(),
        config,
        workspace,
        obsidian: read_obsidian_settings(&root_path),
    })
}

pub fn write_workspace_state(
    root: String,
    workspace: VaultWorkspaceState,
    app_data_root: PathBuf,
) -> Result<(), String> {
    let root_path = fs::canonicalize(&root)
        .map_err(|error| format!("Failed to resolve vault root: {error}"))?;
    if !root_path.is_dir() {
        return Err("Vault root is not a directory.".to_string());
    }

    let serein_dir = vault_metadata_dir(&app_data_root, &root_path);
    fs::create_dir_all(&serein_dir)
        .map_err(|error| format!("Failed to create Serein metadata directory: {error}"))?;
    write_json(&serein_dir.join(WORKSPACE_CONFIG), &normalize_workspace_state(workspace))
}

pub fn read_vault_directory(
    root: String,
    relative_path: String,
    limit: Option<usize>,
) -> Result<VaultDirectory, String> {
    let limit = limit.unwrap_or(300).clamp(1, 1000);
    let root_path = fs::canonicalize(&root)
        .map_err(|error| format!("Failed to read vault root: {error}"))?;

    if !root_path.is_dir() {
        return Err("Vault root is not a directory.".to_string());
    }

    let directory = resolve_vault_path(&root, &relative_path, true)?;
    if !directory.is_dir() {
        return Err("Vault path is not a directory.".to_string());
    }

    let relative_path = directory
        .strip_prefix(&root_path)
        .ok()
        .map(to_slash_path)
        .unwrap_or_default();
    let mut children = Vec::new();
    let mut truncated = false;
    let entries = fs::read_dir(&directory)
        .map_err(|error| format!("Failed to read directory: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to read directory entry: {error}"))?;
        let entry_path = entry.path();
        let file_type = entry.file_type()
            .map_err(|error| format!("Failed to read directory entry type: {error}"))?;
        let name = entry_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_string();

        if file_type.is_dir() {
            if should_skip_directory(&name) {
                continue;
            }

            children.push(VaultTreeEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                relative_path: entry_path
                    .strip_prefix(&root_path)
                    .ok()
                    .map(to_slash_path)
                    .unwrap_or_default(),
                kind: "directory".to_string(),
                file_ext: None,
                children: Vec::new(),
            });
        } else if file_type.is_file() && is_supported_text_path(&entry_path) {
            children.push(VaultTreeEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                relative_path: entry_path
                    .strip_prefix(&root_path)
                    .ok()
                    .map(to_slash_path)
                    .unwrap_or_default(),
                kind: "file".to_string(),
                file_ext: normalized_extension(&entry_path),
                children: Vec::new(),
            });
        }

        if children.len() > limit {
            children.truncate(limit);
            truncated = true;
            break;
        }
    }

    children.sort_by(|left, right| {
        let left_dir = left.kind == "directory";
        let right_dir = right.kind == "directory";
        right_dir
            .cmp(&left_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(VaultDirectory {
        name: directory
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Vault")
            .to_string(),
        path: directory.to_string_lossy().to_string(),
        relative_path,
        children,
        has_more: truncated,
        truncated,
        error: None,
    })
}

pub fn read_vault_index_files(root: String) -> Result<VaultIndexResponse, String> {
    let root_path = fs::canonicalize(&root)
        .map_err(|error| format!("Failed to read vault root: {error}"))?;

    if !root_path.is_dir() {
        return Err("Vault root is not a directory.".to_string());
    }

    let mut files = Vec::new();
    let mut truncated = false;
    let mut skipped_files = 0;
    let mut indexed_bytes = 0;
    collect_vault_index_files(
        &root_path,
        &root_path,
        &mut files,
        &mut truncated,
        &mut skipped_files,
        &mut indexed_bytes,
        IndexLimits {
            file_count: INDEX_FILE_LIMIT,
            per_file_bytes: INDEX_FILE_SIZE_LIMIT,
            total_bytes: INDEX_TOTAL_CONTENT_LIMIT,
        },
    )?;

    files.sort_by(|left, right| left.relative_path.to_lowercase().cmp(&right.relative_path.to_lowercase()));

    Ok(VaultIndexResponse {
        files,
        truncated,
        skipped_files,
        indexed_bytes,
    })
}

pub fn create_vault_entry(root: String, relative_path: String, kind: String) -> Result<String, String> {
    let target = resolve_vault_path(&root, &relative_path, false)?;
    if target.exists() {
        return Err("Target already exists.".to_string());
    }

    match kind.as_str() {
        "file" => {
            ensure_supported_text_path(
                target
                    .to_str()
                    .ok_or_else(|| "Target path is not valid UTF-8.".to_string())?,
            )?;
            atomic_write(&target, b"")?;
            Ok(target.to_string_lossy().to_string())
        }
        "directory" => {
            fs::create_dir(&target).map_err(|error| format!("Failed to create folder: {error}"))?;
            Ok(target.to_string_lossy().to_string())
        }
        _ => Err("Unsupported vault entry kind.".to_string()),
    }
}

pub fn rename_vault_entry(root: String, relative_path: String, new_name: String) -> Result<String, String> {
    if new_name.trim().is_empty()
        || new_name.contains('/')
        || new_name.contains('\\')
        || new_name == "."
        || new_name == ".."
    {
        return Err("Invalid name.".to_string());
    }

    let source = resolve_vault_path(&root, &relative_path, true)?;
    let target = source
        .parent()
        .ok_or_else(|| "Cannot rename vault root.".to_string())?
        .join(new_name.trim());

    if source.is_file() {
        ensure_supported_text_path(
            target
                .to_str()
                .ok_or_else(|| "Target path is not valid UTF-8.".to_string())?,
        )?;
    }

    ensure_path_inside_root(&root, &target, false)?;
    if target.exists() {
        return Err("Target already exists.".to_string());
    }

    fs::rename(&source, &target).map_err(|error| format!("Failed to rename entry: {error}"))?;
    Ok(target.to_string_lossy().to_string())
}

pub fn delete_vault_entry(
    root: String,
    relative_path: String,
    app_data_root: PathBuf,
) -> Result<(), String> {
    if relative_path.trim().is_empty() {
        return Err("Cannot delete vault root.".to_string());
    }

    let root_path = fs::canonicalize(&root)
        .map_err(|error| format!("Failed to resolve vault root: {error}"))?;
    let target = resolve_vault_path(&root, &relative_path, true)?;
    let trash_dir = vault_metadata_dir(&app_data_root, &root_path).join(TRASH_DIR);
    fs::create_dir_all(&trash_dir)
        .map_err(|error| format!("Failed to create vault trash folder: {error}"))?;

    let trash_target = unique_trash_path(&trash_dir, &target)?;
    move_to_trash(&target, &trash_target)
        .map_err(|error| format!(
            "Failed to move entry to vault trash. Nothing was permanently deleted. Check permissions or open the parent folder and move it manually: {error}"
        ))
}

fn collect_vault_index_files(
    root: &Path,
    directory: &Path,
    files: &mut Vec<VaultIndexFile>,
    truncated: &mut bool,
    skipped_files: &mut usize,
    indexed_bytes: &mut u64,
    limits: IndexLimits,
) -> Result<(), String> {
    if *truncated {
        return Ok(());
    }

    if files.len() >= limits.file_count {
        *truncated = true;
        return Ok(());
    }

    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Failed to read vault index directory: {error}"))?;

    for entry in entries {
        if *truncated {
            break;
        }

        if files.len() >= limits.file_count {
            *truncated = true;
            break;
        }

        let entry = entry.map_err(|error| format!("Failed to read vault index entry: {error}"))?;
        let entry_path = entry.path();
        let file_type = entry.file_type()
            .map_err(|error| format!("Failed to read vault index entry type: {error}"))?;
        let name = entry_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_string();

        if file_type.is_dir() {
            if should_skip_directory(&name) {
                continue;
            }

            collect_vault_index_files(
                root,
                &entry_path,
                files,
                truncated,
                skipped_files,
                indexed_bytes,
                limits,
            )?;
            continue;
        }

        if !file_type.is_file() || !is_supported_text_path(&entry_path) {
            continue;
        }

        let metadata = entry.metadata()
            .map_err(|error| format!("Failed to read vault index file metadata: {error}"))?;
        if metadata.len() > limits.per_file_bytes {
            *skipped_files += 1;
            continue;
        }
        if indexed_bytes.saturating_add(metadata.len()) > limits.total_bytes {
            *truncated = true;
            *skipped_files += 1;
            break;
        }

        let content = match fs::read_to_string(&entry_path) {
            Ok(content) => content,
            Err(_) => {
                *skipped_files += 1;
                continue;
            }
        };
        *indexed_bytes = indexed_bytes.saturating_add(metadata.len());

        files.push(VaultIndexFile {
            path: entry_path.to_string_lossy().to_string(),
            relative_path: entry_path
                .strip_prefix(root)
                .ok()
                .map(to_slash_path)
                .unwrap_or_else(|| name.clone()),
            file_name: name,
            file_ext: normalized_extension(&entry_path).unwrap_or_else(|| "md".to_string()),
            content,
        });
    }

    Ok(())
}

#[derive(Clone, Copy)]
struct IndexLimits {
    file_count: usize,
    per_file_bytes: u64,
    total_bytes: u64,
}

fn vault_metadata_dir(app_data_root: &Path, root: &Path) -> PathBuf {
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .map(safe_storage_name)
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "vault".to_string());
    app_data_root
        .join(APP_VAULTS_DIR)
        .join(format!("{}-{}", name, path_fingerprint(root)))
}

fn migrate_legacy_metadata(
    root: &Path,
    config_path: &Path,
    workspace_path: &Path,
) -> Result<(), String> {
    let legacy_dir = root.join(LEGACY_SEREIN_DIR);
    if !legacy_dir.is_dir() {
        return Ok(());
    }

    copy_legacy_metadata_file(&legacy_dir.join(VAULT_CONFIG), config_path)?;
    copy_legacy_metadata_file(&legacy_dir.join(WORKSPACE_CONFIG), workspace_path)?;
    cleanup_legacy_metadata(&legacy_dir, config_path, workspace_path)
}

fn copy_legacy_metadata_file(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() || !source.is_file() {
        return Ok(());
    }

    let parent = target
        .parent()
        .ok_or_else(|| "Serein metadata target has no parent folder.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create Serein metadata folder: {error}"))?;
    fs::copy(source, target)
        .map_err(|error| format!("Failed to migrate legacy Serein metadata: {error}"))?;
    Ok(())
}

fn cleanup_legacy_metadata(
    legacy_dir: &Path,
    config_path: &Path,
    workspace_path: &Path,
) -> Result<(), String> {
    remove_legacy_file_if_migrated(&legacy_dir.join(VAULT_CONFIG), config_path)?;
    remove_legacy_file_if_migrated(&legacy_dir.join(WORKSPACE_CONFIG), workspace_path)?;
    let _ = remove_empty_dir_tree(legacy_dir)?;
    Ok(())
}

fn remove_legacy_file_if_migrated(source: &Path, target: &Path) -> Result<(), String> {
    if source.is_file() && target.is_file() {
        fs::remove_file(source)
            .map_err(|error| format!("Failed to remove migrated legacy Serein metadata: {error}"))?;
    }
    Ok(())
}

fn remove_empty_dir_tree(dir: &Path) -> Result<bool, String> {
    if !dir.is_dir() {
        return Ok(false);
    }

    let mut empty = true;
    for entry in fs::read_dir(dir)
        .map_err(|error| format!("Failed to inspect legacy Serein metadata directory: {error}"))? {
        let entry = entry.map_err(|error| format!("Failed to inspect legacy Serein metadata entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            if !remove_empty_dir_tree(&path)? {
                empty = false;
            }
        } else {
            empty = false;
        }
    }

    if empty {
        fs::remove_dir(dir)
            .map_err(|error| format!("Failed to remove empty legacy Serein metadata directory: {error}"))?;
    }
    Ok(empty)
}

fn safe_storage_name(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

fn path_fingerprint(path: &Path) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in path.to_string_lossy().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn read_or_create_vault_config(root: &Path, path: &Path) -> Result<VaultConfig, String> {
    if path.exists() {
        let raw = fs::read_to_string(path)
            .map_err(|error| format!("Failed to read vault config: {error}"))?;
        let mut config: VaultConfig = serde_json::from_str(&raw)
            .map_err(|error| format!("Failed to parse vault config: {error}"))?;
        config.updated_at = timestamp_string();
        write_json(path, &config)?;
        return Ok(config);
    }

    let now = timestamp_string();
    let config = VaultConfig {
        version: 1,
        name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Vault")
            .to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    write_json(path, &config)?;
    Ok(config)
}

fn read_or_create_workspace_state(path: &Path) -> Result<VaultWorkspaceState, String> {
    if path.exists() {
        let raw = fs::read_to_string(path)
            .map_err(|error| format!("Failed to read vault workspace state: {error}"))?;
        let workspace: VaultWorkspaceState = serde_json::from_str(&raw)
            .map_err(|error| format!("Failed to parse vault workspace state: {error}"))?;
        let workspace = normalize_workspace_state(workspace);
        write_json(path, &workspace)?;
        return Ok(workspace);
    }

    let workspace = default_workspace_state();
    write_json(path, &workspace)?;
    Ok(workspace)
}

fn default_workspace_state() -> VaultWorkspaceState {
    VaultWorkspaceState {
        version: 1,
        recent_files: Vec::new(),
        last_opened_file: None,
        selected_dir: String::new(),
        expanded_dirs: vec![String::new()],
        layout: VaultLayoutState {
            sidebar_width: 240,
            sidebar_visible: true,
            right_panel_visible: true,
            right_panel_width: 300,
            editor_left_gap: 42,
            ui_scale: 100,
        },
        center_graph: default_center_graph_state(),
    }
}

fn normalize_workspace_state(mut workspace: VaultWorkspaceState) -> VaultWorkspaceState {
    workspace.version = 1;
    workspace.recent_files.truncate(12);
    if workspace.expanded_dirs.is_empty() {
        workspace.expanded_dirs.push(String::new());
    }
    workspace.layout.sidebar_width = workspace.layout.sidebar_width.clamp(180, 360);
    workspace.layout.right_panel_width = workspace.layout.right_panel_width.clamp(240, 520);
    workspace.layout.editor_left_gap = workspace.layout.editor_left_gap.clamp(16, 140);
    workspace.layout.ui_scale = workspace.layout.ui_scale.clamp(85, 130);
    if workspace.center_graph.active_view != "graph" {
        workspace.center_graph.active_view = "markdown".to_string();
    }
    if !workspace.center_graph.open {
        workspace.center_graph.active_view = "markdown".to_string();
    }
    workspace
}

fn default_center_graph_state() -> crate::model::VaultCenterGraphState {
    crate::model::VaultCenterGraphState {
        open: false,
        active_view: "markdown".to_string(),
        selected_tag: String::new(),
        isolated_only: false,
        show_unresolved: false,
    }
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize vault metadata: {error}"))?;
    atomic_write(path, serialized.as_bytes())
}

fn read_obsidian_settings(root: &Path) -> VaultObsidianSettings {
    let obsidian_dir = root.join(".obsidian");
    if !obsidian_dir.is_dir() {
        return VaultObsidianSettings {
            detected: false,
            attachment_folder_path: None,
        };
    }

    let app_json = obsidian_dir.join("app.json");
    let attachment_folder_path = fs::read_to_string(app_json)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|value| value.get("attachmentFolderPath").and_then(|item| item.as_str()).map(str::to_string))
        .filter(|value| !value.trim().is_empty());

    VaultObsidianSettings {
        detected: true,
        attachment_folder_path,
    }
}

fn unique_trash_path(trash_dir: &Path, target: &Path) -> Result<PathBuf, String> {
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Target entry has no valid file name.".to_string())?;
    let base = format!("{}.{}", timestamp_ms(), file_name);

    for attempt in 0..100 {
        let candidate = if attempt == 0 {
            trash_dir.join(&base)
        } else {
            trash_dir.join(format!("{}.{}", base, attempt))
        };
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Failed to choose a unique trash path.".to_string())
}

fn move_to_trash(source: &Path, target: &Path) -> Result<(), String> {
    match fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            if source.is_file() {
                fs::copy(source, target)
                    .map_err(|copy_error| format!("{rename_error}; fallback copy failed: {copy_error}"))?;
                fs::remove_file(source)
                    .map_err(|remove_error| format!("{rename_error}; fallback remove failed after copy: {remove_error}"))?;
                return Ok(());
            }

            if source.is_dir() {
                copy_dir_all(source, target)
                    .map_err(|copy_error| format!("{rename_error}; fallback directory copy failed: {copy_error}"))?;
                fs::remove_dir_all(source)
                    .map_err(|remove_error| format!("{rename_error}; fallback directory remove failed after copy: {remove_error}"))?;
                return Ok(());
            }

            Err(rename_error.to_string())
        }
    }
}

fn copy_dir_all(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|error| format!("Failed to create trash directory: {error}"))?;

    for entry in fs::read_dir(source)
        .map_err(|error| format!("Failed to read directory for trash copy: {error}"))? {
        let entry = entry.map_err(|error| format!("Failed to read directory entry for trash copy: {error}"))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry.file_type()
            .map_err(|error| format!("Failed to read entry type for trash copy: {error}"))?;

        if file_type.is_dir() {
            copy_dir_all(&source_path, &target_path)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &target_path)
                .map_err(|error| format!("Failed to copy file to trash: {error}"))?;
        }
    }

    Ok(())
}

fn timestamp_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_index_stops_when_total_content_limit_is_reached() {
        let root = temp_dir("index-total-limit");
        fs::create_dir_all(&root).expect("create temp vault");
        fs::write(root.join("a.md"), "alpha").expect("write a");
        fs::write(root.join("b.md"), "bravo").expect("write b");
        fs::write(root.join("c.md"), "charlie").expect("write c");

        let mut files = Vec::new();
        let mut truncated = false;
        let mut skipped_files = 0;
        let mut indexed_bytes = 0;
        collect_vault_index_files(
            &root,
            &root,
            &mut files,
            &mut truncated,
            &mut skipped_files,
            &mut indexed_bytes,
            IndexLimits {
                file_count: 10,
                per_file_bytes: 1024,
                total_bytes: 10,
            },
        )
        .expect("collect index files");

        assert!(truncated);
        assert_eq!(skipped_files, 1);
        assert!(indexed_bytes <= 10);
        assert!(files.len() < 3);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn vault_metadata_is_stored_outside_vault_root() {
        let root = temp_dir("metadata-vault");
        let app_data = temp_dir("metadata-app-data");
        fs::create_dir_all(&root).expect("create temp vault");

        init_vault(root.to_string_lossy().to_string(), app_data.clone()).expect("init vault");

        let metadata_dir = vault_metadata_dir(&app_data, &fs::canonicalize(&root).expect("canonical root"));
        assert!(metadata_dir.join(VAULT_CONFIG).is_file());
        assert!(metadata_dir.join(WORKSPACE_CONFIG).is_file());
        assert!(!root.join(LEGACY_SEREIN_DIR).exists());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn legacy_serein_metadata_is_migrated_and_cleaned_when_empty() {
        let root = temp_dir("legacy-clean-vault");
        let app_data = temp_dir("legacy-clean-app-data");
        let legacy_dir = root.join(LEGACY_SEREIN_DIR);
        fs::create_dir_all(&legacy_dir).expect("create legacy metadata");
        fs::write(legacy_dir.join(VAULT_CONFIG), r#"{"version":1,"name":"Legacy","createdAt":"1","updatedAt":"1"}"#)
            .expect("write legacy config");
        fs::write(legacy_dir.join(WORKSPACE_CONFIG), serde_json::to_string(&default_workspace_state()).expect("workspace json"))
            .expect("write legacy workspace");

        init_vault(root.to_string_lossy().to_string(), app_data.clone()).expect("init vault");

        let metadata_dir = vault_metadata_dir(&app_data, &fs::canonicalize(&root).expect("canonical root"));
        assert!(metadata_dir.join(VAULT_CONFIG).is_file());
        assert!(metadata_dir.join(WORKSPACE_CONFIG).is_file());
        assert!(!legacy_dir.exists());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn legacy_serein_trash_is_preserved_during_metadata_cleanup() {
        let root = temp_dir("legacy-trash-vault");
        let app_data = temp_dir("legacy-trash-app-data");
        let legacy_dir = root.join(LEGACY_SEREIN_DIR);
        let trash_dir = legacy_dir.join(TRASH_DIR);
        fs::create_dir_all(&trash_dir).expect("create legacy trash");
        fs::write(legacy_dir.join(VAULT_CONFIG), r#"{"version":1,"name":"Legacy","createdAt":"1","updatedAt":"1"}"#)
            .expect("write legacy config");
        fs::write(legacy_dir.join(WORKSPACE_CONFIG), serde_json::to_string(&default_workspace_state()).expect("workspace json"))
            .expect("write legacy workspace");
        fs::write(trash_dir.join("deleted.md"), "recoverable").expect("write trash file");

        init_vault(root.to_string_lossy().to_string(), app_data.clone()).expect("init vault");

        assert!(!legacy_dir.join(VAULT_CONFIG).exists());
        assert!(!legacy_dir.join(WORKSPACE_CONFIG).exists());
        assert_eq!(fs::read_to_string(trash_dir.join("deleted.md")).expect("read trash"), "recoverable");

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(app_data);
    }

    #[test]
    fn delete_vault_entry_moves_to_app_data_trash() {
        let root = temp_dir("trash-vault");
        let app_data = temp_dir("trash-app-data");
        fs::create_dir_all(&root).expect("create temp vault");
        fs::write(root.join("note.md"), "delete me").expect("write note");

        delete_vault_entry(root.to_string_lossy().to_string(), "note.md".to_string(), app_data.clone())
            .expect("delete entry");

        let metadata_dir = vault_metadata_dir(&app_data, &fs::canonicalize(&root).expect("canonical root"));
        let trash_entries = fs::read_dir(metadata_dir.join(TRASH_DIR))
            .expect("read trash")
            .count();
        assert_eq!(trash_entries, 1);
        assert!(!root.join("note.md").exists());
        assert!(!root.join(LEGACY_SEREIN_DIR).join(TRASH_DIR).exists());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(app_data);
    }

    fn temp_dir(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "serein-vault-{}-{}-{}",
            label,
            std::process::id(),
            timestamp_ms()
        ))
    }
}
