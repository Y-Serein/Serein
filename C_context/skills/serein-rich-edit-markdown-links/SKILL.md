---
name: serein-rich-edit-markdown-links
description: Use this skill when debugging or changing Serein Rich Edit Markdown link behavior, including realtime preview of standard links, escaped links, URL autolinks, nested malformed links, extra backslashes from Milkdown serialization, ordinary click-to-edit/source expansion, drag-select-copy inside expanded links, Ctrl/Cmd-click link opening, and pointer/selection/focus state-machine regressions.
---

# Serein Rich Edit Markdown Links

Use this skill for Rich Edit link rendering and interaction bugs. The goal is Typora-like behavior without breaking Serein's data safety.

## Required Context

Read these first:

```text
AGENTS.md
HANDOFF.md
C_context/PROJECT_MEMORY.md
C_context/KNOWN_FAILURES.md
```

The current app is:

```text
D_deliverables/serein-desktop/
```

Do not work in old `ys-writer-desktop` paths unless the user explicitly asks.

## Control Loop

Frame the work as:

1. 目标：the exact link behavior the user should see.
2. 状态：current git state, source paths, user examples, existing tests.
3. 误差：where preview/edit/open/copy/save diverges.
4. 控制动作：smallest parser/state-machine/normalization change.
5. 反馈：test/build/GUI/user result.
6. 修正：adjust based on feedback, not assumptions.
7. 验证：run relevant checks and state GUI gaps.
8. 沉淀：update HANDOFF/memory/KNOWN_FAILURES/skill when the pattern repeats.

## Target Semantics

Rich Edit links have three distinct states:

- Preview state: default display is the rendered label or URL, not raw Markdown.
- Source expansion state: ordinary click temporarily shows `[text](url)` or `<url>` in the editor body for editing, selecting, and copying.
- Open state: `Ctrl+LeftClick` on Windows/Linux or `Cmd+LeftClick` on macOS opens the link.

Selection rules:

- If the cursor or selection still intersects the expanded source, keep it expanded.
- If focus/cursor leaves the expanded source, convert back to a link mark.
- Drag-select-copy must not collapse the source on `pointerup`, ordinary `click`, or the next `selectionchange`.

## Parser Rules

Do not use simple regex as the main parser for links. Markdown links can contain:

- Parentheses in labels, e.g. `NUT(7)`.
- Escaped punctuation in labels, e.g. `[eez\_studio](url)`.
- Parentheses in URLs.
- Nested malformed links, e.g. `[text]([https://x](https://x))`.
- Autolinks, e.g. `<https://www.cnblogs.com/...>`.

Use a scanner-style parser that tracks:

- `[` / `]`
- `(` / `)` nesting in destinations
- escaped characters
- image prefix `![](...)` exclusion

Keep standard Markdown link and autolink source forms separate:

```markdown
[text](https://example.com)
<https://example.com>
```

## Normalization Rules

Milkdown/Rich serialization may emit escaped Markdown punctuation. Normalize only bounded link forms:

- `\[text]\(https\://example.com)` -> `[text](https://example.com)`
- `[eez\_studio](url)` -> `[eez_studio](url)`
- `\<https\://example.com\>` -> `<https://example.com>`

Do not globally strip backslashes. Always skip fenced code blocks:

````markdown
```
\[text]\(https\://example.com)
```
````

Rich mode may use `normalizeRichMarkdownEscapes`; Plain mode should not inherit Rich serializer cleanup unless there is a specific Plain-mode bug.

## Source Paths

Primary files:

```text
D_deliverables/serein-desktop/src/components/MilkdownEditor.tsx
D_deliverables/serein-desktop/src/shared/markdown.ts
D_deliverables/serein-desktop/src/App.tsx
D_deliverables/serein-desktop/tests/vault.test.mjs
```

Functions to inspect in `MilkdownEditor.tsx`:

```text
markdownLinkSources
convertTypedMarkdownLink
markdownLinkTextRangeAtCursor
convertMarkdownLinkRange
expandActiveLinkToMarkdown
refreshExpandedLink
handlePointerDown
handleFocusOut
handleClick
handleSelectionChange
```

App-level mode boundary:

```text
handleMarkdownChange
handleRichMarkdownBaseline
```

## Regression Examples

Use real user examples in tests:

```markdown
### \[NUT(7)]\(https\://networkupstools.org/docs/man/nut.html)
### \[Improv Wi-Fi: Open standard for setting up Wi-Fi via Bluetooth LE and Serial]\(\[https\://www\.improv-wifi.com/]\(https\://www\.improv-wifi.com/))
## 3. [eez\_studio示例（RT-Thread） - SiFli SDK编程指南 文档](https://docs.sifli.com/projects/sdk/latest/sf32lb55x/example/multimedia/lvgl/lvgl_tools_example/eez_studio/README.html)
* \<https\://www.cnblogs.com/tianwuyvlianshui/p/18698331\>
```

Expected normalized source:

```markdown
### [NUT(7)](https://networkupstools.org/docs/man/nut.html)
### [Improv Wi-Fi: Open standard for setting up Wi-Fi via Bluetooth LE and Serial](https://www.improv-wifi.com/)
## 3. [eez_studio示例（RT-Thread） - SiFli SDK编程指南 文档](https://docs.sifli.com/projects/sdk/latest/sf32lb55x/example/multimedia/lvgl/lvgl_tools_example/eez_studio/README.html)
* <https://www.cnblogs.com/tianwuyvlianshui/p/18698331>
```

## Verification

Run from `D_deliverables/serein-desktop/`:

```bash
npm run test
npm run typecheck
npm run build
```

Run from repo root:

```bash
git -c safe.directory=/home/slam/Project/Serein diff --check
git -c safe.directory=/home/slam/Project/Serein status --short
```

For interaction regressions, GUI verification should cover:

- Default preview shows only label/URL.
- Ordinary click expands source and stays expanded after mouse release.
- Drag-select-copy inside expanded source is possible.
- Moving cursor/focus away collapses source back to rendered link.
- `Ctrl/Cmd + click` opens the link.
- Saving does not introduce extra backslashes.

If Playwright or Windows release GUI testing is unavailable, say so explicitly. Do not claim GUI behavior is verified from `npm run build` alone.

## Commit Boundary

Stage only relevant source, tests, and memory/skill files. Do not stage root installer files such as:

```text
Serein_1.0.4_x64-setup.exe
```
