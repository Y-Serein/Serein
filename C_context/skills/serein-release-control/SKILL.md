---
name: serein-release-control
description: Use this skill whenever working on the Serein/Typora desktop app release, internal beta, Vault/Obsidian-like workflow, Typora-like writing experience, Windows packaging, or post-test bug triage. It enforces the project’s control-loop workflow, data-safety priorities, validation gates, and known pitfalls from the Serein release audit.
---

# Serein Release Control

Use this skill when the user asks to audit, package, test, release, triage feedback, or improve the Serein/Typora desktop app.

## Operating Loop

Start every substantial task with this frame:

1. 目标：what release/user outcome matters.
2. 状态：what is currently known from files, tests, or user feedback.
3. 误差：what differs from the target.
4. 控制动作：the smallest change or test that can reduce the error.
5. 反馈：what the command/user/UI result showed.
6. 修正：adjust based on feedback, not assumptions.
7. 验证：run the smallest relevant check.
8. 沉淀：update HANDOFF or memory when the task is a milestone.

Keep the loop practical. Do not write theory if the next step is obvious; state the control variable and act.

## Product Priorities

Respect this order:

1. Data safety: no silent loss, overwrite, or unsafe link rewrite.
2. Typora-like writing experience: edit, save, Rich/Plain Edit, links, images, tables, PDF export.
3. Obsidian/Vault workflow: wiki links, backlinks, outgoing links, graph, unresolved note creation.
4. Startup speed and no large-directory freezing.
5. UI simplicity and polish.
6. Architecture cleanup only when it reduces real risk or unlocks the next feature.

If the user pushes for broad feature work while data safety or writing basics are weak, say so directly and propose a safer slice.

## Release Gates

For internal beta, require:

- Windows release `.exe` built from the latest code.
- A copied test Vault, not a user’s only real notes.
- Smoke test on a clean Windows machine.
- At minimum, verify:
  - open Vault
  - create/edit/save/reopen note
  - Rich Edit and Plain Edit
  - Markdown link and wiki link jump
  - `[[` suggestions and unresolved creation
  - image preview and PDF export
  - graph open/close
  - right panel open/close
  - window minimize/maximize/close

For public release, additionally require:

- version bump
- installer signing or explicit SmartScreen plan
- known issues list
- backup/rollback story for link rewrite
- large Vault performance test
- clean install and uninstall checks

## Build Guidance

Use the project packaging script:

```powershell
.\T_tools\build_windows.ps1
```

Use `-SkipInstall` only when Windows dependencies are known fresh:

```powershell
.\T_tools\build_windows.ps1 -SkipInstall
```

The installer path is:

```text
D_deliverables\ys-writer-desktop\src-tauri\target\release\bundle\nsis\Serein_0.0.1_x64-setup.exe
```

Tell users that the installer is directly usable by Windows x64 testers and does not require Node/Rust/source, but unsigned internal builds may trigger SmartScreen.

## Validation Commands

Prefer the smallest relevant validation:

```bash
cd D_deliverables/ys-writer-desktop
npm run test
npm run typecheck
npm run build
```

Rust/Tauri static check:

```bash
cd D_deliverables/ys-writer-desktop/src-tauri
env CARGO_TARGET_DIR=/tmp/ys-writer-tauri-target /home/slam/.cargo/bin/cargo check
```

Known non-blocking warnings:

- Vite may warn that `MilkdownEditor` chunk exceeds 500 kB.
- `git diff --check` may warn about `LICENSE` CRLF even when untouched.

## Known Pitfalls

- Do not modify `D_deliverables/ys_typora_app/` unless explicitly requested.
- Do not recursively scan huge Vault directories.
- Do not treat browser smoke as proof of Tauri window behavior.
- Tauri 2 window APIs require matching capabilities; prefer already-authorized APIs.
- SVG icon clicks may have `SVGElement` targets, not `HTMLElement`.
- Milkdown/ProseMirror may consume first clicks for selection; internal wiki links should handle navigation early enough to feel like single-click.
- Floating UI inside editor DOM may be mispositioned; use a portal to `document.body` for cursor popovers when needed.
- Avoid duplicated UI entry points. The user rejected having search in too many places.
- Never silently batch-rewrite user notes. Prompt, protect dirty files, and verify metadata before writing.

## Complex Test Vault

Use this Vault for internal smoke testing:

```text
D_deliverables/serein-complex-vault/
```

It covers:

- long-form writing
- tables
- tasks
- code blocks
- images
- PDF export
- wiki heading jumps
- aliases
- unresolved links
- duplicate basenames
- Chinese paths
- paths with spaces
- folder links

## Handoff Discipline

Update `HANDOFF.md` at milestones or before stopping. Keep it short enough that the user can resume in 30 seconds. Use the exact project structure:

```markdown
# HANDOFF.md

最后更新：YYYY-MM-DD HH:mm
当前分支：
当前任务：

## 当前在做什么
## 已经试过的方案和结果（含失败的）
## 下一步计划（3-5条actionable)
## 关键文件路径（相对路径，一行一个）
## 当前验证状态
## 还没搞清楚的问题
```

Put longer lessons, preferences, prompt templates, and pitfalls in `C_context/PROJECT_MEMORY.md`.
