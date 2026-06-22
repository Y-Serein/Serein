use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{
    model::{ImportedAsset, LocalAssetData, MarkdownFile, SavedMarkdownFile},
    path_security::{
        ensure_path_inside_root, ensure_supported_export_path, ensure_supported_image_name,
        ensure_supported_text_path, is_supported_image_extension, normalized_extension,
    },
    safe_fs::{atomic_write, backup_existing_file, ensure_reasonable_text_size, metadata_modified_time_ms},
};

const MAX_IMAGE_ASSET_BYTES: usize = 25 * 1024 * 1024;

pub fn read_markdown_file(path: String) -> Result<MarkdownFile, String> {
    ensure_supported_text_path(&path)?;

    let file_path = Path::new(&path);
    let metadata = fs::metadata(file_path)
        .map_err(|error| format!("Failed to read file metadata: {error}"))?;
    if !metadata.is_file() {
        return Err("Target path is not a regular file.".to_string());
    }
    let byte_len = usize::try_from(metadata.len())
        .map_err(|_| "File is too large to open safely in Serein.".to_string())?;
    ensure_reasonable_text_size(byte_len)?;

    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read file. Check that the file exists, is readable, and is not locked by another app: {error}"))?;

    Ok(MarkdownFile {
        path: path.clone(),
        file_name: file_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled.md")
            .to_string(),
        file_ext: normalized_extension(file_path).unwrap_or_else(|| "md".to_string()),
        content,
        modified_at_ms: metadata_modified_time_ms(&metadata)?,
        size: metadata.len(),
    })
}

pub fn write_markdown_file(
    path: String,
    content: String,
    expected_modified_at_ms: Option<u64>,
    expected_size: Option<u64>,
    backup_root: PathBuf,
) -> Result<SavedMarkdownFile, String> {
    ensure_supported_text_path(&path)?;
    ensure_reasonable_text_size(content.len())?;

    let file_path = Path::new(&path);
    if file_path.exists() {
        let metadata = fs::metadata(file_path)
            .map_err(|error| format!("Failed to read existing file before saving: {error}"))?;
        if !metadata.is_file() {
            return Err("Target path exists but is not a regular file. Choose another save location.".to_string());
        }

        if let (Some(expected_modified_at_ms), Some(expected_size)) = (expected_modified_at_ms, expected_size) {
            let current_modified_at_ms = metadata_modified_time_ms(&metadata)?;
            if current_modified_at_ms != Some(expected_modified_at_ms) || metadata.len() != expected_size {
                return Err("The file changed on disk after it was opened. Serein stopped the save to avoid overwriting external edits. Reopen the file, compare changes, or use Save As.".to_string());
            }
        }

        backup_existing_file(file_path, &backup_root)?;
    }

    atomic_write(file_path, content.as_bytes())?;
    let metadata = fs::metadata(file_path)
        .map_err(|error| format!("Saved file, but failed to read updated metadata: {error}"))?;

    Ok(SavedMarkdownFile {
        path: path.clone(),
        file_name: file_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled.md")
            .to_string(),
        file_ext: normalized_extension(file_path).unwrap_or_else(|| "md".to_string()),
        modified_at_ms: metadata_modified_time_ms(&metadata)?,
        size: metadata.len(),
    })
}

pub fn write_export_file(path: String, format: String, bytes: Vec<u8>) -> Result<(), String> {
    ensure_supported_export_path(&path, &format)?;
    ensure_reasonable_text_size(bytes.len())?;

    let file_path = Path::new(&path);
    if file_path.exists() {
        let metadata = fs::metadata(file_path)
            .map_err(|error| format!("Failed to read export target before writing: {error}"))?;
        if !metadata.is_file() {
            return Err("Export target exists but is not a regular file.".to_string());
        }
    }

    atomic_write(file_path, &bytes)
}

pub fn import_editor_asset(
    vault_root: Option<String>,
    current_file_path: String,
    file_name: String,
    bytes: Vec<u8>,
    attachment_folder: Option<String>,
) -> Result<ImportedAsset, String> {
    ensure_supported_text_path(&current_file_path)?;
    if bytes.is_empty() {
        return Err("Image is empty.".to_string());
    }
    if bytes.len() > MAX_IMAGE_ASSET_BYTES {
        return Err(format!(
            "Image is too large to import safely ({} MB limit).",
            MAX_IMAGE_ASSET_BYTES / 1024 / 1024
        ));
    }

    let safe_name = ensure_supported_image_name(&file_name)?;
    let current_path = Path::new(&current_file_path);
    if !current_path.is_file() {
        return Err("Save the current document before importing images.".to_string());
    }

    if let Some(root) = vault_root.as_deref() {
        ensure_path_inside_root(root, current_path, true)?;
    }

    let target_dir = resolve_attachment_dir(current_path, attachment_folder.as_deref())?;
    if let Some(root) = vault_root.as_deref() {
        ensure_path_inside_root(root, &target_dir, false)?;
    }
    fs::create_dir_all(&target_dir)
        .map_err(|error| format!("Failed to create assets folder: {error}"))?;

    let target_path = unique_asset_path(&target_dir, &safe_name);
    atomic_write(&target_path, &bytes)?;

    Ok(ImportedAsset {
        relative_markdown_path: relative_markdown_path(current_path, &target_path)?,
        file_name: target_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(&safe_name)
            .to_string(),
        path: target_path.to_string_lossy().to_string(),
    })
}

pub fn import_editor_asset_from_path(
    vault_root: Option<String>,
    current_file_path: String,
    source_path: String,
    attachment_folder: Option<String>,
) -> Result<ImportedAsset, String> {
    ensure_supported_text_path(&current_file_path)?;
    if source_path.trim().is_empty() || source_path.contains('\0') {
        return Err("Image path is empty.".to_string());
    }

    let source = Path::new(&source_path);
    if !source.is_absolute() {
        return Err("Selected image path must be absolute.".to_string());
    }

    let metadata = fs::metadata(source)
        .map_err(|error| format!("Failed to read selected image metadata: {error}"))?;
    if !metadata.is_file() {
        return Err("Selected image is not a regular file.".to_string());
    }
    if metadata.len() as usize > MAX_IMAGE_ASSET_BYTES {
        return Err(format!(
            "Image is too large to import safely ({} MB limit).",
            MAX_IMAGE_ASSET_BYTES / 1024 / 1024
        ));
    }

    let extension = normalized_extension(source)
        .ok_or_else(|| "Image file needs an extension.".to_string())?;
    if !is_supported_image_extension(&extension) {
        return Err("Only png, jpg, jpeg, gif, webp and svg images are supported.".to_string());
    }

    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Selected image has no valid file name.".to_string())?
        .to_string();
    let bytes = fs::read(source)
        .map_err(|error| format!("Failed to read selected image: {error}"))?;

    import_editor_asset(vault_root, current_file_path, file_name, bytes, attachment_folder)
}

pub fn read_local_asset_data_url(
    vault_root: Option<String>,
    current_file_path: String,
    source: String,
) -> Result<LocalAssetData, String> {
    ensure_supported_text_path(&current_file_path)?;

    let source = source.trim();
    if source.is_empty()
        || source.contains('\0')
        || source.starts_with("http://")
        || source.starts_with("https://")
        || source.starts_with("data:")
        || source.starts_with('#')
    {
        return Err("Only local image paths can be embedded.".to_string());
    }

    let current_path = Path::new(&current_file_path);
    if let Some(root) = vault_root.as_deref() {
        ensure_path_inside_root(root, current_path, true)?;
    }

    let is_explicit_absolute_source = is_explicit_absolute_asset_source(source);
    let asset_path = resolve_asset_path(current_path, source)?;
    if let Some(root) = vault_root.as_deref().filter(|_| !is_explicit_absolute_source) {
        ensure_path_inside_root(root, &asset_path, true)?;
    }

    let extension = normalized_extension(&asset_path)
        .ok_or_else(|| "Image file needs an extension.".to_string())?;
    if !is_supported_image_extension(&extension) {
        return Err("Unsupported local image extension.".to_string());
    }

    let bytes = fs::read(&asset_path)
        .map_err(|error| format!("Failed to read local image: {error}"))?;
    if bytes.len() > MAX_IMAGE_ASSET_BYTES {
        return Err("Local image is too large to embed.".to_string());
    }

    let mime = image_mime(&extension);
    Ok(LocalAssetData {
        data_url: format!("data:{mime};base64,{}", base64_encode(&bytes)),
        mime: mime.to_string(),
    })
}

fn resolve_asset_path(current_path: &Path, source: &str) -> Result<PathBuf, String> {
    let source = source
        .split('#')
        .next()
        .unwrap_or(source)
        .split('?')
        .next()
        .unwrap_or(source)
        .replace('\\', "/");

    if source.starts_with("file://") {
        let decoded = percent_decode(source.trim_start_matches("file://"));
        return Ok(PathBuf::from(decoded));
    }

    let source_path = Path::new(&source);
    if source_path.is_absolute() {
        return Ok(source_path.to_path_buf());
    }

    let parent = current_path
        .parent()
        .ok_or_else(|| "Current document has no parent folder.".to_string())?;
    Ok(parent.join(source_path))
}

fn is_explicit_absolute_asset_source(source: &str) -> bool {
    let source = source
        .split('#')
        .next()
        .unwrap_or(source)
        .split('?')
        .next()
        .unwrap_or(source)
        .replace('\\', "/");

    if source.starts_with("file://") {
        let decoded = percent_decode(source.trim_start_matches("file://"));
        return is_absolute_path_like(&decoded.replace('\\', "/"));
    }

    is_absolute_path_like(&source)
}

fn is_absolute_path_like(source: &str) -> bool {
    Path::new(source).is_absolute() || is_windows_drive_absolute(source) || source.starts_with("//")
}

fn is_windows_drive_absolute(source: &str) -> bool {
    let bytes = source.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && bytes[2] == b'/'
}

fn resolve_attachment_dir(current_path: &Path, attachment_folder: Option<&str>) -> Result<PathBuf, String> {
    let parent = current_path
        .parent()
        .ok_or_else(|| "Current document has no parent folder.".to_string())?;
    let folder = attachment_folder
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("assets")
        .replace('\\', "/");
    if folder.contains('\0')
        || folder.starts_with('/')
        || folder.starts_with("../")
        || folder == ".."
        || folder.contains("/../")
        || folder.contains(':')
    {
        return Err("Image attachment folder must be a relative child folder.".to_string());
    }
    let folder = folder.trim_start_matches("./");
    Ok(parent.join(folder))
}

fn relative_markdown_path(current_path: &Path, target_path: &Path) -> Result<String, String> {
    let parent = current_path
        .parent()
        .ok_or_else(|| "Current document has no parent folder.".to_string())?;
    let relative = target_path
        .strip_prefix(parent)
        .map_err(|_| "Imported image is not next to the current document.".to_string())?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn unique_asset_path(directory: &Path, file_name: &str) -> PathBuf {
    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("image");
    let extension = path
        .extension()
        .and_then(|name| name.to_str())
        .unwrap_or("png");

    for index in 0..1000 {
        let candidate_name = if index == 0 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{index}.{extension}")
        };
        let candidate = directory.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    directory.join(format!("{}-{}.{}", stem, crate::safe_fs::timestamp_ms(), extension))
}

fn image_mime(extension: &str) -> &'static str {
    match extension {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    }
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_value(bytes[index + 1]), hex_value(bytes[index + 2])) {
                output.push((high << 4) | low);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&output).to_string()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        output.push(TABLE[(b0 >> 2) as usize] as char);
        output.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn read_markdown_file_rejects_oversized_file() {
        let directory = temp_dir("oversized-read");
        fs::create_dir_all(&directory).expect("create temp directory");
        let path = directory.join("large.md");
        fs::write(&path, vec![b'a'; 20 * 1024 * 1024 + 1]).expect("write large file");

        let result = read_markdown_file(path.to_string_lossy().to_string());

        assert!(result.is_err());
        assert!(result.err().unwrap().contains("too large"));
        let _ = fs::remove_dir_all(directory);
    }

    fn temp_dir(label: &str) -> PathBuf {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("serein-fs-{}-{}-{}", label, std::process::id(), millis))
    }
}
