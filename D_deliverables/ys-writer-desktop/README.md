# Serein Desktop

Serein is a local-first Markdown writing desktop app.

## Highlights

- Tauri 2 desktop shell with React and TypeScript.
- Milkdown-powered Rich Edit mode plus Plain Edit mode.
- Local Vault browsing with lazy-loaded directory trees.
- Outline, backlinks, and local graph views.
- Chinese/English interface language switching.
- Configurable editor font, font size, theme, and layout.
- Markdown/Text file association for `.md`, `.markdown`, and `.txt`.

## User Manual

See [USER_MANUAL.md](./USER_MANUAL.md) for file operations, search prefixes, tags, bookmarks, and knowledge-panel usage.

## Screenshot

Screenshot placeholder: add a release screenshot after Windows GUI verification.

## Install

Download link placeholder: publish the signed Windows installer after release validation.

Expected Windows installer path after packaging:

```text
src-tauri\target\release\bundle\nsis\Serein_0.0.1_x64-setup.exe
```

## Development

Install dependencies:

```bash
npm ci
```

Run TypeScript validation:

```bash
node node_modules/typescript/lib/tsc.js --noEmit
```

Build frontend:

```bash
npm run build
```

Check Tauri/Rust:

```bash
cd src-tauri
env CARGO_TARGET_DIR=/tmp/ys-writer-tauri-target cargo check
```

Run the desktop app in development mode only when interactive GUI testing is needed:

```bash
npm run tauri:dev
```
