---
name: serein-editor-regression-control
description: Use this skill whenever working on Serein Rich Edit, Plain Edit, code block IME/undo/scroll/language controls/syntax highlighting, Milkdown/ProseMirror/CodeMirror behavior, Web Clipboard API removal, menu paste/copy/cut, Tab/Shift+Tab, Ctrl+A, Ctrl+Z scroll, window chrome/menu hover/drag behavior, minimalist sidebar/ribbon UI polish, Vault tag indexing, status: active/inactive filtering, or Windows release behavior that differs from Linux/browser checks. This skill is specifically for preventing browser-default behavior from leaking into the Serein desktop editor and for closing regressions with search/build/Windows verification.
---

# Serein Editor Regression Control

Use this skill when the user reports editor behavior that feels like a browser instead of a desktop writing tool, or when touching the editor/indexing paths listed below.

## Core Standard

Serein is a desktop Markdown writing tool. Treat browser defaults as implementation details, not product behavior.

The target behavior is:

- Rich Edit, Plain Edit, and code blocks share one coherent editing model.
- Keyboard actions modify text or editor selection, not browser focus state.
- Menu commands operate on the current editor scope, not the whole page.
- Clipboard operations do not trigger Web Clipboard permission prompts.
- Windows release `.exe` behavior is the final user-facing truth.

## Start With The Control Loop

Frame substantial work as:

1. 目标：what user-visible editor/indexing behavior must be true.
2. 状态：facts from source, grep, tests, Windows feedback, screenshots, or build logs.
3. 误差：where current behavior differs.
4. 控制动作：the smallest shared-root fix or diagnostic.
5. 反馈：what command/UI/user result showed.
6. 修正：adjust based on feedback, not assumptions.
7. 验证：run the smallest relevant checks.
8. 沉淀：update HANDOFF/memory/skill when a pattern repeats.

Keep it practical. Do not stop at a nice plan when the root cause is already testable.

## Required Context

Before changing code, read:

```text
AGENTS.md
HANDOFF.md
docs/runbooks/PROJECT_MEMORY.md
```

If present, also read:

```text
docs/runbooks/KNOWN_FAILURES.md
```

The current formal desktop app is:

```text
apps/serein-desktop/
```

Do not work in old prototype directories unless the user explicitly asks.

## User Preferences To Respect

- Default to Chinese, direct and concrete.
- The user accepts pushback, but only with evidence and tradeoffs.
- The user dislikes repeated partial fixes. When one path fails, audit adjacent paths.
- The user is sensitive to "browser thinking": focus jumping, permission prompts, whole-page selection, and scroll jumps are not acceptable editor semantics.
- The user wants Typora/Obsidian used as references, not copied blindly. Preserve useful Serein-specific details.
- The user prefers a clean, restrained UI: fewer visible frames, lighter icons, subtle hover states, and no decorative heaviness.
- Do not claim success without verification. If Windows release was not tested, say so.
- Keep changes minimal and reversible. Do not mix refactors into bug fixes.
- Do not add unrelated UI entry points or debugging UI.

## Clipboard Regression Protocol

Use this when the user mentions:

- Web Clipboard API
- clipboard permission prompt
- menu paste
- copy/cut/paste
- browser clipboard behavior
- `编辑 -> 粘贴`

### Target

Active clipboard reads/writes must go through a desktop boundary, not Web Clipboard API.

Allowed:

- `event.clipboardData` inside a real user `paste/copy/cut` event.
- A Tauri command such as `desktop_read_clipboard_text` or `desktop_write_clipboard_text`.

Avoid:

- `navigator.clipboard`
- `.readText()`
- `.writeText(`
- `document.execCommand("paste")`
- `.enable_clipboard_access()`

`document.execCommand("copy")` may be acceptable only for isolated static browser pages where no desktop bridge exists, but do not use it for editor menu paste.

### Search Gate

Before saying clipboard is fixed, run a negative search across source and build output:

```bash
grep -R "navigator\\.clipboard\\|\\.readText()\\|\\.writeText(\\|execCommand(\"paste\")\\|enable_clipboard_access" \
  apps/serein-desktop/src \
  apps/serein-desktop/src-tauri/src \
  apps/serein-desktop/public \
  apps/serein-desktop/dist \
  -n --include='*.ts' --include='*.tsx' --include='*.rs' --include='*.html' --include='*.js'
```

If `dist` contains a match from a dependency vendor chunk, do not ignore it. Find which import pulled it in. Prefer a narrower import or local replacement over editing `node_modules`.

Known example:

- `@milkdown/kit/component/code-block` re-exports `@milkdown/components/code-block`.
- The default Milkdown code-block component contains `navigator.clipboard.writeText`.
- If only `codeBlockConfig` is needed, use a local config ctx rather than the wide component entry.

### Desktop Bridge Pattern

Prefer:

```text
src/services/clipboard.ts
src-tauri/src/clipboard.rs
src-tauri/src/commands.rs
src-tauri/src/lib.rs
```

Keep the bridge small:

- `desktop_read_clipboard_text`
- `desktop_write_clipboard_text`

On Windows, `windows-sys 0.59` does not expose `CF_UNICODETEXT` from `Win32::System::DataExchange`. Use the Win32 standard format id if avoiding the Ole feature:

```rust
#[cfg(target_os = "windows")]
const CF_UNICODETEXT: u32 = 13;
```

Linux `cargo check` does not typecheck Windows-only imports. Windows build must verify Windows FFI.

## Editor Keyboard Protocol

Use this when the user mentions:

- Tab/Shift+Tab jumping focus
- title or normal text cannot indent
- code block indentation
- Ctrl+A selects other files or whole page
- Ctrl+Z scrolls unexpectedly
- selection persists after closing/reopening files

### Target

Keyboard behavior must be editor-scoped:

- Tab inserts indentation or indents current logical line/block.
- Shift+Tab outdents.
- Ctrl+A selects current code block or current document, not the whole app shell.
- Ctrl+Z/Redo should preserve scroll when the changed content is still visible.
- For Ctrl+Z/Redo scroll, measure whether the selection was visible before running history. If it was visible, restore the previous scroll position. If it was not visible, scroll to the real selection after history runs. Do not infer visibility by projecting post-undo coordinates onto the old scrollTop.
- If a custom Ctrl+Z scroll wrapper causes jumps to document start in Windows release, remove the wrapper first and return to Milkdown/ProseMirror history defaults. Do not stack another scroll compensation layer without a Windows release repro.
- Rich Edit, Plain Edit, and CodeMirror code block paths should all be considered.
- Code blocks are a separate required path. A passing ProseMirror body test does not prove CodeMirror node view behavior. Every undo/redo, cursor, scroll, Tab, selection, cut/copy/paste regression test must include at least one real rendered `.milkdown-code-block`.
- In code blocks, when the cursor is offscreen and undo/redo runs, the cursor should be brought near the center of the editor viewport, not to the top of the code block or document.

## Rich Serializer Self-Feedback Protocol

Use this when Rich Edit typing moves the real cursor to document end/start, especially if the page does not scroll until the user presses an arrow key.

Do not start with cursor save/restore. First check whether Rich Edit reset the whole document:

```text
Milkdown markdownUpdated emits A
App normalizes/stores B
MilkdownEditor receives prop B
lastKnownMarkdownRef still equals A
sync effect calls replaceAll(B)
selection is rebuilt
```

Key files:

```text
components/MilkdownEditor.tsx
shared/markdown.ts
App.tsx
tests/vault.test.mjs
```

Rules:

- `emitMarkdownChange` must store in `lastKnownMarkdownRef` the exact markdown passed to `onChange`.
- If App Rich mode uses `normalizeRichMarkdownEscapes`, the editor's local known value must use the same normalized output.
- If only one file triggers the issue, analyze its Markdown structure before changing events.
- Fenced-code normalization must track marker and length. Four-backtick blocks can contain triple-backtick examples that are content, not closers.
- Use `tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt` as the known regression sample.

### Do Not Patch One Key In Isolation

Map all involved layers first:

```text
App.tsx
components/MilkdownEditor.tsx
components/sereinCodeBlockView.ts
styles.css
```

Check:

- ProseMirror selection
- CodeMirror selection
- DOM/window selection
- editor focus
- menu command path
- keyboard shortcut path
- context menu path

If multiple actions fail together, look for a shared event/selection/scroll model bug.

## Code Block Single-Model Protocol

Use this when the user mentions:

- Sogou/IME odd input in code blocks
- code block undo/redo cursor jumps
- code block language button missing or wrong
- syntax highlighting
- code block visual size/thickness
- code block exit rules
- "previous code block details disappeared"

### Architecture Target

Do not reintroduce a nested editable CodeMirror as the primary code block editor.

The stable model is:

- Milkdown/ProseMirror owns code text, history, selection, IME, paste, save, and undo/redo.
- The code block NodeView only provides wrapper UI:
  - language button
  - language candidate list
  - copy button
  - DOM wrappers
- Syntax highlighting is display-only decoration over ProseMirror content. It must not own text or selection.

Relevant files:

```text
components/MilkdownEditor.tsx
components/sereinCodeBlockView.ts
components/codeBlockConfig.ts
styles.css
```

### Details To Preserve

Before editing code blocks, explicitly protect these behaviors:

- IME input must be continuous. No odd/even missing input.
- Undo/redo must keep cursor and viewport synchronized.
- If the undo target is already visible, do not force-center or jump.
- If the undo target is offscreen, scroll near the target, not to the editor top.
- The bottom-right language control must stay available for the current code block.
- `ArrowDown` on the code block last line moves to the language control; `ArrowDown` again exits the block.
- Language is keyboard-editable and candidate-selectable.
- Unknown languages are preserved as text even if not highlighted.
- Candidate list must include common languages such as `bash`.
- Empty code block can accept blank lines; Backspace at the empty start may turn it into a paragraph.
- Exiting a non-empty code block on Enter should follow the project blank-line rule, not a generic Markdown shortcut that eats useful blank lines.

### Visual Debugging Rule

When the user provides a screenshot with a marked code block size:

1. Identify the actual DOM/CSS box under the mark.
2. Check generic selectors such as `.milkdown pre` before changing NodeView logic.
3. Keep functional controls while making the visible box lighter.

Known example:

- The visible code block looked too large because `.milkdown pre` background/padding applied to `.serein-code-host`.
- The fix was not changing text ownership; it was making the host transparent and moving the visible background to `.serein-code-content`.

### State Cleanup

Language button draft state must not outlive the real language attribute.

If the user edits a language draft and then chooses from the candidate list, clear:

```text
data-language-draft
data-language-fresh
```

Also clear draft state when the code block language attribute changes externally.

## Window Chrome And Minimal UI Protocol

Use this when the user mentions:

- top menu hover opens but does not close
- menu bar blank area cannot drag the window
- left sidebar/ribbon/icons feel thick
- too many frames or boxes
- UI should be simpler like Typora, but not blindly copied

### Window Chrome Target

- Hovering another top menu while a menu is open may switch the open menu.
- Moving the mouse outside the menu bar and popover should close the menu.
- Clicking a menu item should dispatch the command and close the menu.
- Blank menu bar area should start Tauri window drag.
- Buttons, inputs, menu popovers, and window controls must not start drag.

Relevant files:

```text
features/window-chrome/WindowChrome.tsx
App.tsx
styles.css
```

Check:

```text
isWindowDragBlockedTarget
handleChromeDragMouseDown
.menu-popover
.command-bar
```

Avoid hover gaps between the menu root and popover. A `top: calc(100% + 4px)` style can create a gap that makes mouseleave behavior flaky; prefer a contiguous hit area when using mouseleave close.

### Minimal UI Target

Make the app quieter without removing affordances:

- Reduce border and shadow density.
- Reduce SVG stroke width for sidebars/ribbons/tabs.
- Use subtle hover backgrounds.
- Avoid hover translations for workbench navigation.
- Remove heavy active bars unless they carry essential state.
- Keep cards and controls only where they frame real repeated items or commands.

Do not delete controls merely to make the UI lighter. The user wants useful details preserved with less visual weight.

## Release Version Commit Gate

Use this when an editor/UI regression is being committed as a new release version.

Before commit:

- Synchronize version in:

```text
package.json
package-lock.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml
src-tauri/Cargo.lock
```

- Check staged files and exclude old installer artifacts such as root-level `Serein_*.exe`.
- Use `git -c safe.directory=/home/slam/Project/Serein ...` if dubious ownership blocks Git.
- If Git identity is missing, use the project-approved one-time identity:

```text
Y-Serein <2034755070@qq.com>
```

After commit:

- Create a matching local tag, for example `v1.0.3`.
- Clearly state whether branch and tag were pushed. If not pushed, GitHub will not show the release/tag.

## Vault Tag Index Protocol

Use this when the user mentions:

- `@remark`
- tags only found in the open file
- unopened same-folder files not indexed
- inactive tags still searchable
- `status: active` / `status: inactive`

### Target

Vault tag search must not depend on whether a file is currently open.

Tag enablement is controlled by frontmatter:

```yaml
status: active
status: inactive
```

Expected behavior:

- `status: active` tags can be indexed/searched.
- `status: inactive` tags should not appear as enabled/searchable.
- A file saved on disk should become searchable without needing to be opened.
- An open editor buffer should not falsely make inactive tags searchable.
- Do not fix tag search by forcing a full vault index during startup. Startup should restore the vault shell and root directory quickly; search intent should trigger indexing on demand and show an indexing state.
- Current-file upsert is only a freshness override for opened/saved files. It must not be the only path that makes a tag searchable.
- Search intent includes quick open / CommandPalette, not just the left sidebar search panel. Do not gate quick open on `vaultIndex.files.length`; otherwise unopened vaults cannot trigger the index needed for search.

### Check These Files

```text
src/vault/index.ts
src/App.tsx
tests/vault.test.mjs
features/vault-sidebar/VaultSidebar.tsx
features/palette/CommandPalette.tsx
```

Use a real test fixture if the user gives one, for example:

```text
tests/fixtures/rich-edit/new.md
```

Test both opened and unopened files.

## Validation Gates

Use the smallest relevant checks first:

```bash
cd apps/serein-desktop
npm run typecheck
npm run build
```

Rust static check:

```bash
cd apps/serein-desktop/src-tauri
env CARGO_TARGET_DIR=/tmp/serein-desktop-tauri-target /home/slam/.cargo/bin/cargo check
```

For Windows release behavior:

```powershell
.\scripts\build_windows.ps1
```

Do not say Windows is verified unless the Windows build or release `.exe` was actually tested after the latest fix.

## Bundle And Dependency Audit

When removing browser APIs, source search is not enough.

After `npm run build`, search `dist` too. If a vendor chunk still contains the banned API:

1. Identify the dependency import that pulled it in.
2. Replace a wide import with a narrow import or local implementation.
3. Rebuild.
4. Search `dist` again.

Do not edit `node_modules` as the durable fix.

## Handoff And Memory

At the end of a long regression session, update:

```text
HANDOFF.md
docs/runbooks/PROJECT_MEMORY.md
```

Use HANDOFF for immediate resume state and next actions.

Use PROJECT_MEMORY for:

- user preferences
- repeated mistakes
- project constraints
- prompt templates
- known pitfalls

## Prompt Template

Use this when the user wants the same level of rigor in one prompt:

```text
你是 Serein 桌面编辑器回归修复负责人。请先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md 和 docs/runbooks/skills/serein-editor-regression-control/SKILL.md；如果项目有 preflight 就先跑。不要先猜，不要只修我指出的一个按钮。

目标：把 Serein 的编辑器行为从浏览器默认态收敛到桌面写作工具语义。Rich Edit、Plain Edit、代码块、普通文本、标题、列表、菜单命令、快捷键都要一致。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”推进：
1. 先列当前事实：相关源码路径、工作区改动、已知 Windows release 反馈、可验证命令。
2. 如果问题涉及粘贴/复制/剪切，必须全局搜索并消除主动 Web Clipboard API：navigator.clipboard、readText、writeText、execCommand("paste")、enable_clipboard_access；搜索范围包括 src、src-tauri、public、dist。
3. 如果问题涉及 Tab/全选/撤销/光标滚动，必须同时检查 Rich Edit、Plain Edit、CodeMirror 代码块、ProseMirror selection 和 DOM selection，不允许只 patch 单一路径。
4. 如果问题涉及 Vault 标签/索引，必须验证未打开文件、同层文件、保存后索引、status: active/inactive 过滤，不允许只验证当前打开文件。
5. 每个修复只改最小共享根因，不做无关重构；完成后跑 npm run typecheck、npm run build、cargo check，并说明 Windows build/release 是否已验证。
6. 若改到 Windows-only Rust/Tauri API，必须让 Windows build 验证；如果本机不能验证，必须查 API 定义并明确标注未实测。
7. 完成后更新 HANDOFF、PROJECT_MEMORY，并沉淀新坑到 skill。
```
