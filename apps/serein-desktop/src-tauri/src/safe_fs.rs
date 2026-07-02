use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_TEXT_FILE_BYTES: usize = 20 * 1024 * 1024;

pub fn ensure_reasonable_text_size(byte_len: usize) -> Result<(), String> {
    if byte_len > MAX_TEXT_FILE_BYTES {
        return Err(format!(
            "File is too large to save safely in Serein ({} MB limit). Split the document or use Save As for a smaller file.",
            MAX_TEXT_FILE_BYTES / 1024 / 1024
        ));
    }

    Ok(())
}

pub fn metadata_modified_time_ms(metadata: &fs::Metadata) -> Result<Option<u64>, String> {
    match metadata.modified() {
        Ok(modified) => Ok(Some(system_time_ms(modified)?)),
        Err(_) => Ok(None),
    }
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Target file has no parent directory.".to_string())?;
    if !parent.is_dir() {
        return Err("Target folder no longer exists. Choose Save As and select a valid folder.".to_string());
    }

    let temp_path = unique_sibling_path(path, "serein-tmp");
    let write_result = write_temp_file(&temp_path, bytes)
        .and_then(|_| replace_with_temp(&temp_path, path));

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

pub fn backup_existing_file(path: &Path, backup_root: &Path) -> Result<Option<PathBuf>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to read existing file before backup: {error}"))?;
    if !metadata.is_file() {
        return Err("Target path exists but is not a regular file. Choose another save location.".to_string());
    }
    if metadata.permissions().readonly() {
        return Err("File is read-only. Change file permissions or use Save As to save a copy.".to_string());
    }

    let backup_dir = backup_root.join(path_fingerprint(path));
    fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("Failed to create backup folder: {error}"))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document.md");
    let backup_path = backup_dir.join(format!("{}.{}.bak", file_name, timestamp_ms()));
    fs::copy(path, &backup_path)
        .map_err(|error| format!("Failed to create backup before saving: {error}"))?;

    Ok(Some(backup_path))
}

fn path_fingerprint(path: &Path) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in path.to_string_lossy().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

pub fn timestamp_ms() -> u64 {
    system_time_ms(SystemTime::now()).unwrap_or(0)
}

fn system_time_ms(time: SystemTime) -> Result<u64, String> {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .map_err(|error| format!("File timestamp is before UNIX epoch: {error}"))
}

fn write_temp_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Failed to create temporary save file: {error}"))?;
    file.write_all(bytes)
        .map_err(|error| format!("Failed to write temporary save file: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Failed to flush temporary save file to disk: {error}"))?;
    drop(file);
    Ok(())
}

#[cfg(target_os = "windows")]
fn replace_with_temp(temp_path: &Path, target_path: &Path) -> Result<(), String> {
    if target_path.exists() {
        fs::remove_file(target_path)
            .map_err(|error| format!("Failed to replace existing file after backup: {error}"))?;
    }
    fs::rename(temp_path, target_path)
        .map_err(|error| format!("Failed to move temporary file into place: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn replace_with_temp(temp_path: &Path, target_path: &Path) -> Result<(), String> {
    fs::rename(temp_path, target_path)
        .map_err(|error| format!("Failed to move temporary file into place: {error}"))
}

fn unique_sibling_path(path: &Path, label: &str) -> PathBuf {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document");
    let process_id = std::process::id();

    for attempt in 0..100 {
        let candidate = parent.join(format!(
            ".{}.{}.{}.{}",
            file_name,
            label,
            process_id,
            timestamp_ms() + attempt
        ));
        if !candidate.exists() {
            return candidate;
        }
    }

    parent.join(format!(".{}.{}.{}", file_name, label, timestamp_ms()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_existing_file_uses_external_backup_root() {
        let project = temp_dir("project");
        let backup_root = temp_dir("backups");
        fs::create_dir_all(&project).expect("create project dir");
        let file_path = project.join("note.md");
        fs::write(&file_path, "before").expect("write note");

        let backup_path = backup_existing_file(&file_path, &backup_root)
            .expect("backup succeeds")
            .expect("backup path");

        assert!(backup_path.starts_with(&backup_root));
        assert!(!project.join(".serein-backups").exists());
        assert_eq!(fs::read_to_string(backup_path).expect("read backup"), "before");

        let _ = fs::remove_dir_all(project);
        let _ = fs::remove_dir_all(backup_root);
    }

    fn temp_dir(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "serein-safe-fs-{}-{}-{}",
            label,
            std::process::id(),
            timestamp_ms()
        ))
    }
}
