# Serein Desktop Quick Start

Serein is a local Markdown desktop writer with a linked Vault workflow. Files stay on disk; opening, saving, renaming, and deleting operate on real local files.

## Start

1. Open Serein.
2. Choose `File -> Open vault`, or click `Open` in the left Vault panel.
3. Select a local folder that contains Markdown or text files.
4. Click a `.md`, `.markdown`, or `.txt` file in the left file tree to edit it.

For first-time use, open `Help -> User manual`. It is an HTML learning page with a complete feature guide and an editable Markdown practice area for headings, paths, tags, links, and properties.

If the app restores a previous vault and fails to load it, use `Clear vault state` in the left panel, then open the vault again.

## Editing and Saving

- `Plain Edit` edits raw Markdown text.
- `Rich Edit` edits the same Markdown through the rich editor.
- `Ctrl+S` writes the current file back to disk.
- `File -> Save as` writes a copy to a selected path.
- `New note`, `New folder`, rename, and delete act on the selected Vault folder.

Delete moves the target to the Serein app-data trash instead of permanently deleting it from disk. Confirm the target before accepting the prompt.

## Knowledge Panel

The Knowledge Panel can stay docked on the right or float as a movable panel. Use `Float` to detach it and `Dock` to return it to the right side. When floating, drag its title bar to move it.

The panel has these tabs:

- `Backlinks`
- `Outgoing`
- `Properties`
- `Graph`
- `Tags`

## Files and Outline

The left rail usually shows `Files` and `Outline`; `Search` appears when you run a search.

### Files

Shows the current Vault file tree. Click a file to open it.

- Use the `+` button at the lower-right of the left rail to create a new note.
- Use `File -> New folder` to create a folder in the selected Vault directory.

### Outline

Shows headings from the current file. Click a heading to jump to it.

Supported heading levels shown in the outline are `#` through `######`.

## Obsidian / Vault Basics

### Headings

Use standard Markdown headings:

```markdown
# Project title
## Next steps
### Risks
```

- The first H1 is used as the note title when present; otherwise Serein uses the file name.
- The left Outline reads headings and lets you jump to them.
- Links can target headings, for example `[[Project Atlas#Next steps]]`.

### Paths

Paths come from relative file and folder positions inside the Vault. There is no separate path syntax to create.

If the Vault contains:

```text
Projects/
  Atlas.md
Notes/
  Research.md
```

You can write:

```markdown
[[Projects/Atlas]]
[Research](./Notes/Research.md)
```

Directory links such as `[Index](./Notes/)` resolve to `index.md`, `README.md`, or another supported directory entry file.

### Tags and Properties

Inline tags:

```markdown
#project
#project/atlas
```

YAML frontmatter tags and aliases:

```markdown
---
tags: [project, writing]
aliases: [Atlas, Project Atlas]
status: active
---
```

- `tags` appear in search, the right Tags panel, and graph filtering.
- `aliases` are used for Wiki link candidates and unlinked mentions.
- Other properties appear in the right Knowledge Panel.

## Backlinks

Shows Vault files that link to the current file.

Backlinks only appear after:

1. A Vault is open.
2. The linked files are inside that Vault.
3. The links use a supported Markdown format.
4. The file has been saved, or the Vault index has refreshed after opening/creating/renaming/deleting files.

## Graph

Shows a minimal Local Graph for the current file.

- The center node is the current file.
- Neighbor nodes are files linked from the current file or files linking back to it.
- Lines are real Markdown links from the Vault index.
- Click a node to open that file.

If Graph shows only one node, the current file is indexed but has no resolved links yet. If it shows an empty message, save the file inside the Vault or reopen the Vault so it can be indexed.

## Supported Links

The Vault index recognizes:

```markdown
[[note]]
[[note#heading]]
[[note|alias]]
[[path/note#heading|alias]]
[text](path.md)
[text](folder/path.markdown)
[text](../relative/path.md)
[text](./)
#tag
```

For `[[note]]`, Serein resolves by note name or relative path. If multiple files share the same base name, the first indexed match wins; use a path-style link or Markdown relative link to avoid ambiguity.

For directory-style Markdown links like `[q](./)` or `[q](../folder/)`, Serein tries to resolve the directory to one of these files:

- `index.md`
- `index.markdown`
- `index.txt`
- `README.md`
- `README.markdown`
- `README.txt`

If none exists, the link is shown as unresolved and will not create a Graph edge because the local graph only connects file nodes.

External links and image embeds are ignored by the local graph.

## Index Limits

To keep large Vaults responsive, indexing skips hidden/heavy directories and has limits:

- Supported file types: `.md`, `.markdown`, `.txt`
- Maximum indexed files: 2000
- Maximum indexed file size: 1 MB
- Skipped directories include `.git`, dot folders, `node_modules`, `target`, `build`, `dist`, `out`, `install`, `images`, `logs`, `tmp`, `__pycache__`, and `venv`

If the panel says the index is partial, narrow the Vault or move heavy/generated folders outside the Vault.

## Window Controls

- Drag the title bar or empty menu-bar area to move the window.
- Use the top-right buttons to minimize, maximize/restore, or close.
- Menu buttons remain clickable and are not drag handles.

## Windows Build

From Windows PowerShell at the repository root:

```powershell
.\T_tools\build_windows.ps1 -SkipInstall
```

If dependencies are missing, run:

```powershell
.\T_tools\build_windows.ps1
```
