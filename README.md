# Serein

Serein is a local Markdown desktop writing tool built with Tauri 2, React, TypeScript, and Milkdown.

The current release target is the desktop application in:

```text
apps/serein-desktop/
```

## Features

- Local Markdown and text file editing.
- Vault-style folder browsing with lazy directory loading.
- Plain Edit and Rich Edit modes.
- Outline, backlinks, and local graph panels.
- Bilingual UI: Simplified Chinese and English.
- Configurable editor fonts, font size, layout, theme, and shortcuts.

## Download

Release downloads will be published here after Windows packaging is verified.

## Build

```bash
cd apps/serein-desktop
npm ci
npm run build
```

For Tauri static checking:

```bash
cd apps/serein-desktop/src-tauri
env CARGO_TARGET_DIR=/tmp/serein-tauri-target cargo check
```

Windows release packaging should be run on Windows:

```powershell
.\scripts\build_windows.ps1
```

After Windows dependencies have been installed once, `-SkipInstall` can be used
for repeat builds. Do not use `-SkipInstall` with `node_modules` created from
WSL/Linux.
