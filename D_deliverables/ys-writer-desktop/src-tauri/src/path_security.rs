use std::{
    fs,
    path::{Component, Path, PathBuf},
};

pub fn ensure_supported_text_path(path: &str) -> Result<(), String> {
    let file_path = Path::new(path);
    let Some(extension) = normalized_extension(file_path) else {
        return Err("Only .md, .markdown and .txt files are supported.".to_string());
    };

    match extension.as_str() {
        "md" | "markdown" | "txt" => Ok(()),
        _ => Err("Only .md, .markdown and .txt files are supported.".to_string()),
    }
}

pub fn ensure_supported_export_path(path: &str, format: &str) -> Result<(), String> {
    let file_path = Path::new(path);
    let Some(extension) = normalized_extension(file_path) else {
        return Err("Export target must end with .html or .pdf.".to_string());
    };

    match (format, extension.as_str()) {
        ("html", "html" | "htm") => Ok(()),
        ("pdf", "pdf") => Ok(()),
        _ => Err("Export target extension does not match the selected export format.".to_string()),
    }
}

pub fn ensure_supported_image_name(name: &str) -> Result<String, String> {
    let clean = name
        .trim()
        .replace('\\', "_")
        .replace('/', "_")
        .replace('\0', "");
    let clean = clean.trim_matches('.').trim();
    if clean.is_empty() {
        return Err("Image file name is empty.".to_string());
    }

    let path = Path::new(clean);
    let extension = normalized_extension(path).ok_or_else(|| "Image file needs an extension.".to_string())?;
    if !is_supported_image_extension(&extension) {
        return Err("Only png, jpg, jpeg, gif, webp and svg images are supported.".to_string());
    }

    Ok(clean.to_string())
}

pub fn is_supported_image_extension(extension: &str) -> bool {
    matches!(extension, "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg")
}

pub fn is_supported_text_path(path: &Path) -> bool {
    normalized_extension(path)
        .map(|extension| matches!(extension.as_str(), "md" | "markdown" | "txt"))
        .unwrap_or(false)
}

pub fn normalized_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

pub fn resolve_vault_path(root: &str, relative_path: &str, must_exist: bool) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute() {
        return Err("Absolute paths are not allowed inside vault operations.".to_string());
    }

    let mut clean_relative = PathBuf::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => {
                if clean_relative.as_os_str().is_empty() && part == ".serein" {
                    return Err("The .serein metadata directory is managed by Serein.".to_string());
                }
                clean_relative.push(part);
            }
            Component::CurDir => {}
            _ => return Err("Path traversal is not allowed.".to_string()),
        }
    }

    let root_path = fs::canonicalize(root)
        .map_err(|error| format!("Failed to resolve vault root: {error}"))?;
    let target = root_path.join(clean_relative);
    ensure_path_inside_root(root, &target, must_exist)?;
    Ok(target)
}

pub fn ensure_path_inside_root(root: &str, target: &Path, must_exist: bool) -> Result<(), String> {
    let root_path = fs::canonicalize(root)
        .map_err(|error| format!("Failed to resolve vault root: {error}"))?;
    let comparable = if must_exist {
        fs::canonicalize(target).map_err(|error| format!("Failed to resolve target path: {error}"))?
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| "Target path has no parent.".to_string())?;
        fs::canonicalize(parent)
            .map_err(|error| format!("Failed to resolve target parent: {error}"))?
    };

    if comparable.starts_with(root_path) {
        Ok(())
    } else {
        Err("Target path is outside the vault.".to_string())
    }
}

pub fn should_skip_directory(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }

    matches!(
        name,
        "node_modules"
            | "target"
            | "build"
            | "dist"
            | "out"
            | "install"
            | "images"
            | "logs"
            | "tmp"
            | "__pycache__"
            | "venv"
    )
}

pub fn to_slash_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
