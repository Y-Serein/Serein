---
name: serein-rich-edit-cursor-stability
description: Use this skill when Serein Rich Edit cursor or selection jumps after typing, deleting, pressing space/Enter, switching focus, or editing a specific complex Markdown/text file; especially when the page does not scroll immediately but the real cursor moves to the document end/start, or after changes to Milkdown serialization, markdown normalization, fenced code parsing, frontmatter, wiki links, Markdown links, or autolinks.
---

# Serein Rich Edit Cursor Stability

Use this skill for Rich Edit cursor jumps, selection loss, unexpected full-document replacement, or file-specific typing regressions.

## Required Context

Read first:

```text
AGENTS.md
HANDOFF.md
docs/runbooks/PROJECT_MEMORY.md
docs/runbooks/KNOWN_FAILURES.md
```

Current app:

```text
apps/serein-desktop/
```

Do not use old `ys-writer-desktop` paths unless the user explicitly asks.

## Control Loop

State before editing:

1. 目标：what cursor/selection behavior should remain stable.
2. 状态：current git state, user file, user mode, recent commits, and source paths.
3. 误差：where selection/cursor differs from user expectation.
4. 控制动作：smallest sync/parser/normalization fix.
5. 反馈：tests, build, real file comparison, GUI/user result.
6. 修正：update based on facts, not a broad cursor patch.
7. 验证：commands and GUI gaps.
8. 沉淀：HANDOFF, memory, skill when the pattern repeats.

## First Diagnosis

Do not start by forcibly saving and restoring the cursor. First check whether Rich Edit is resetting the whole document.

Primary suspicious chain:

```text
Milkdown markdownUpdated -> emitMarkdownChange(A)
App handleMarkdownChange normalizes/stores B
MilkdownEditor receives markdown prop B
lastKnownMarkdownRef is still A
sync effect thinks external document changed
replaceAll(B)
ProseMirror selection is rebuilt, often near document end
```

Relevant paths:

```text
apps/serein-desktop/src/components/MilkdownEditor.tsx
apps/serein-desktop/src/shared/markdown.ts
apps/serein-desktop/src/App.tsx
apps/serein-desktop/tests/vault.test.mjs
```

Functions/refs to inspect:

```text
emitMarkdownChange
lastKnownMarkdownRef
editorDocumentFromMarkdown
markdown prop sync useEffect
replaceAll(nextDocument.bodyMarkdown)
handleMarkdownChange
handleRichMarkdownBaseline
normalizeRichMarkdownEscapes
normalizeWikiLinkEscapes
```

## File-Specific Regressions

If only one file triggers the cursor jump, analyze that file before changing code.

Check for:

- YAML frontmatter
- CRLF/LF line endings
- HTML such as `<br />`
- fenced code blocks
- four-backtick blocks containing triple-backtick examples
- Markdown links `[text](url)`
- URL autolinks `<https://...>`
- escaped punctuation such as `\_`, `\#`, `\*`
- code-block content that looks like Markdown but must remain literal

Known regression file:

```text
tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt
```

This file contains a four-backtick block with nested triple-backtick code examples. A simple boolean fence state machine misclassified inner triple backticks, causing Rich normalization to rewrite content that should have been skipped.

## Fence Rules

Markdown normalization must track fence marker and length:

- Backtick fences close only with backticks.
- Tilde fences close only with tildes.
- Closing fence length must be at least opening fence length.
- Closing fence line should contain only optional spaces after the fence.
- Inner shorter fences are content while a longer fence is active.

Avoid:

```ts
if (/^ {0,3}(```+|~~~+)/.test(line)) inFence = !inFence;
```

Prefer one helper that maps only outside fenced code, then reuse it for wiki and Rich normalizers.

## Sync Boundary Rules

When Rich mode normalizes serializer output:

- The markdown sent to `onChange` and the markdown stored in `lastKnownMarkdownRef` must be identical.
- If App stores normalized B, the editor must also record B before the prop returns.
- Plain mode should not inherit Rich serializer cleanup unless fixing a Plain-specific bug.
- Do not globally strip backslashes. Only normalize bounded link/autolink/wiki forms outside fenced code.

## Verification

Run from `apps/serein-desktop/`:

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

For the known real file, compare normalization before/after:

```bash
node --input-type=module -e 'import fs from "node:fs"; import { normalizeRichMarkdownEscapes } from "./apps/serein-desktop/.test-dist/shared/markdown.js"; const s=fs.readFileSync("tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt","utf8"); const n=normalizeRichMarkdownEscapes(s); console.log(JSON.stringify({same:s===n, sourceLength:s.length, normalizedLength:n.length}));'
```

Expected for a clean source file:

```json
{"same":true}
```

GUI/user verification should cover:

- Rich Edit preview mode.
- Typing a normal character and a space near top, middle, and bottom.
- The page does not need to scroll immediately, but the real cursor must remain where typing occurred.
- Pressing ArrowUp/ArrowDown after typing must not reveal that the cursor jumped to document end/start.
- `tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt` specifically.

If Windows release was not rebuilt or retested, say so. Do not claim release verification from Vite build alone.

## Commit Boundary

Stage only relevant source, tests, memory, and skill files. Do not stage root installer files such as:

```text
Serein_1.0.4_x64-setup.exe
```
