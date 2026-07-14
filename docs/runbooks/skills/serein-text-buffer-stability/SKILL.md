---
name: serein-text-buffer-stability
description: Use this skill whenever work touches Serein's single-editor Markdown text-buffer, Typora-like Rich/Source behavior, Ctrl+A semantic selection, CodeMirror history/selection/decoration, outline jumps or wrong scroll targets, Source gutter desynchronization, typed/pending fences, code language controls, list/quote/code nesting, compact editor/settings UI, original Markdown markers, EOF exits, stale Vite HMR results, large-document performance, or recovery against commit 93590e3. Trigger even when the user only says the editor jumps, characters disappear, headings turn into code, shortcuts take too many rows, the fix did nothing on Windows, the code feels patched/bloated, or asks to restore earlier behavior without deleting their work.
---

# Serein Text Buffer Stability

Use this skill when the task touches the experimental single-editor text-buffer engine.

The goal is not to prove the architecture is elegant. The goal is to make Serein reliably writable.

## Required Context

Read first:

```text
AGENTS.md
HANDOFF.md
docs/runbooks/PROJECT_MEMORY.md
docs/runbooks/KNOWN_FAILURES.md
docs/runbooks/CAPABILITY_BASELINE.md
```

Current app:

```text
apps/serein-desktop/
```

Key files:

```text
apps/serein-desktop/src/components/MarkdownTextBufferEditor.tsx
apps/serein-desktop/src/editor/textBufferMarkdown.ts
apps/serein-desktop/src/shared/markdown.ts
apps/serein-desktop/src/components/MilkdownEditor.tsx
apps/serein-desktop/src/App.tsx
apps/serein-desktop/src/styles.css
apps/serein-desktop/tests/text-buffer-markdown.test.mjs
apps/serein-desktop/tests/vault.test.mjs
tests/fixtures/rich-edit/00_raw.txt
tests/fixtures/rich-edit/nested_list_quote_code.md
```

Do not delete or replace the default Milkdown path while the text-buffer engine is experimental.

## Control Loop

Before editing, state:

1. 目标：what user-visible writing behavior must be true.
2. 状态：current code path, mode, screenshot/file, and known validation.
3. 误差：how current behavior differs from the user's design.
4. 控制动作：smallest variable to change.
5. 反馈：test, screenshot, source roundtrip, or user result.
6. 修正：adjust based on feedback.
7. 验证：commands and Playwright/user checks.
8. 沉淀：update HANDOFF/memory/skill when the pattern is reusable.

## User First Principles

User-specific Serein behavior outranks generic library defaults.

Preserve:

- Rich/实时预览 does not show source active-line highlight.
- Source mode shows source tokens, line numbers, and active-line highlighting.
- `Ctrl+Z / Redo`: history owns content and selection; scroll layer only adjusts viewport. If target selection is visible, preserve scroll. If target selection is offscreen, scroll near the selection/middle, never stick it to the editor top.
- Code block content is literal while editing inside an existing code block. Typing ``` inside code must not restructure the surrounding document or swallow the next heading.
- If needed, upgrade the outer fence length, for example ```bash -> ````bash, so an inner ``` remains content.
- Code language control follows only the current cursor code block. It should appear at the lower-right of the active code block, not on hover and not on every block.
- The language control accepts arbitrary case and unknown names, keeps the entered value, includes `bash` in candidates, and supports ArrowDown/Enter flow.
- Code block visual design keeps block background, left content inset, spacing, and lower-right language control.
- `Ctrl+A` is a two-stage semantic selection contract for all content, not a code-block-only shortcut.
- Markdown marker identity is intentional. Preserve `-`, `*`, `+`, ordered markers, and quote/container structure unless the user explicitly asks for normalization.
- Outline, language controls, save state, selection, and history must derive from the editor's current Markdown state rather than cached/deferred offsets.
- When the user asks for isolated testing, create fully fictional fixtures and do not read, copy, or automate against their real documents or Vault.
- Do not operate Windows processes or launch desktop instances without explicit authorization. Browser-local smoke permission does not imply process-control permission.
- Compact UI is intentional: settings rows such as shortcuts should remain one functional row when the available width can support it, not expand into card-like four-row blocks.

## Stable Baselines And Safe Recovery

Treat code and behavior baselines separately:

```text
current code base: current main / b6fe725-era worktree
stable behavior reference: 93590e3
```

Do not checkout the whole repository to `93590e3`. The user wants its behavior and design contracts, not a destructive rollback of later work.

When the worktree is dirty:

1. Inspect `git status --short` and identify relevant WIP.
2. Use `git show`, `git grep`, and screenshots to extract the old behavior.
3. For risky recovery, create an isolated worktree from the current code baseline.
4. Validate the candidate in isolation.
5. Re-check the real user worktree. A passing candidate is not delivered until the fix is merged back and revalidated there.
6. Replace whole files only when they belong exclusively to the experimental engine. Merge shared App/CSS/tests by reviewed hunk.
7. Never use reset/checkout/restore to erase user work.

## One Source Of Truth

The target model is:

```text
Markdown text -> one CodeMirror EditorState -> decorations/widgets/outline/save
```

Rich and Source may change presentation, but not the owner of content, selection, or history.

Reject designs that create any of these parallel truths:

- React/deferred Markdown offsets used to command a newer CodeMirror document.
- A language widget that trusts coordinates captured when the widget was constructed.
- A separate parser for outline fences and another parser for editor fences.
- App string history used as fallback after CodeMirror history.
- CSS visual positions that disagree with CodeMirror's measured line layout.

Consolidate the smallest shared semantic primitive instead of adding another compensating branch.

## Semantic Ctrl+A Contract

First `Ctrl+A` selects the current semantic unit. Repeating `Ctrl+A` with that exact unit selected selects the whole document.

Use these boundaries:

| Context | First selection | Structure preserved |
| --- | --- | --- |
| fenced code | logical code content | opening/closing fence and list/quote prefix |
| ATX heading | visible heading content | `# ` prefix and heading level |
| Setext heading | heading text line | underline marker |
| paragraph | current logical/physical text line | surrounding document |
| list item | item content | `- `, `* `, `+ `, ordered marker and indentation |
| blockquote | quote content | `> ` prefix |
| empty line/block | empty semantic position first, document second | structure around it |

Keep the boundary calculation in a pure parser/domain function. The component should only dispatch selection and track the special empty-range second stage.

Test both selection and mutation: replace the first-stage range, then verify the Markdown structure still parses and undo restores it.

## Outline And Language Current-State Protocol

Do not send stale source offsets from the outline to text-buffer.

Use a heading identity:

```text
level + text + same-name occurrence + fallback index
```

On click, resolve that identity inside `view.state.doc` and only then dispatch selection/scroll.

Why: changing an empty code language to `bash` adds four source characters immediately. React deferred Markdown can still contain the old heading offsets during the same event cycle.

Before choosing a scroll API, identify the actual overflow owner:

1. Inspect computed `overflow` for `.cm-scroller` and its ancestors.
2. Record `scrollTop` on every candidate while reproducing the jump.
3. If `.cm-scroller` is `overflow: visible` and `.editor-surface` is `overflow: auto`, CodeMirror does not own the viewport.
4. Keep selection in the CodeMirror transaction, but compute the target with `lineBlockAt()` / `documentTop` and write the real surface `scrollTop`.
5. Coalesce rapid outline commands with one measure key so the latest click wins.

Do not accept a smoke merely because the target selection changed or the line became visible in Chromium. Assert that the real scroll owner's `scrollTop` changed and that the final visible heading belongs to the last clicked identity.

For language controls:

1. Treat input text as a draft until commit.
2. Before commit, find the current block again by stable opener identity.
3. Apply the change using current `languageFrom/languageTo`.
4. Mark it as a normal input/history transaction.
5. Re-read the updated block before ArrowDown exit.
6. Prevent Enter/DOM rebuild/blur from dispatching the same change twice.

## Marker And Container Visual Contract

Do not normalize all unordered list markers to `•` in CSS. Render the marker carried by the Markdown analysis.

For list/quote/code nesting:

- Preserve list indentation and quote depth in the code-block analysis.
- Restore the `93590e3` code font, background, content inset, vertical padding, and lower-right language control.
- Align quote border and nested background to the same container boundary.
- Use measured padding and non-interactive pseudo-elements. Do not use margin on CodeMirror editable lines or widgets.
- Validate with screenshots, because correct DOM classes can still produce the wrong container geometry.

## Evidence-First Workflow

Before editing, build one deterministic failure proof when feasible.

For this class of regression, capture at least:

```text
selection from/to/text
current document length/source
outline target line and selected text
computed list marker content
language input value
page errors
screenshot for container geometry
```

Run the same proof after the fix and require the output to reverse. Example acceptance:

```text
heading first selection: First
heading second selection: whole document
list marker: "-"
language draft/commit: bash
immediate outline selection: ## Target
page errors: []
```

Do not accept a fix solely because typecheck passes or a parser returns one code block.

## Common Failure Modes

### Parser owns too much behavior

Symptom:

- Typing ``` inside an existing code block closes the block.
- Following `### heading` becomes code content.
- Source/Rich roundtrip changes fence structure unexpectedly.

Rule:

- Parser output is a structure hint, not the final editing intent.
- Protect active code-block editing before accepting parser restructuring.
- Add tests for root/list/blockquote/nested/EOF code fences.

For a fence being typed in Rich mode:

- Treat the third backtick as an editing-state transition, not immediate permission to restructure the rest of the document.
- Keep the pending opener visible at normal line height.
- Persist pending identity when the cursor leaves the opener.
- Do not pair it with a later existing closer.
- Confirm it on Enter by creating a local closer and placing the cursor in the new code body.
- Distinguish same-line InlineCode from multiline deeply indented fence compatibility; do not disable all InlineCode nodes.

### Deferred outline owns stale coordinates

Symptom:

- Outline occasionally jumps above/below the requested heading.
- Changing a code language alters where the outline click lands.
- Same-name headings are unstable.

Rule:

- Do not patch offsets repeatedly in App state.
- Pass heading identity and resolve against CodeMirror's current document.
- Cover immediate click after language-length change, duplicate headings, Setext, nested/long fences, and pending fences.

### CodeMirror layout breaks coordinates

Symptom:

- Visible cursor and `.cm-activeLine` are on different lines.
- Clicking visible heading keeps selection in previous code block.
- ArrowUp/ArrowDown cannot reach a visible heading.

Rule:

- Do not use CSS margin on `.cm-line`, heading line, code-language inline widgets, or other measured editable lines.
- Prefer padding or a measured widget strategy.
- If text is visible but not clickable, inspect decoration and DOM coordinate mapping before changing parser logic.

### Scroll owner mismatch

Symptom:

- Outline selection changes but the viewport remains on the old heading.
- Rapid clicks are intermittent.
- `cm-scroller.scrollTop` stays 0 while its bounding top becomes strongly negative.

Rule:

- The element with `overflow: auto/scroll` owns the viewport.
- Do not use focus order, arbitrary delay, repeated RAF, or `EditorView.scrollIntoView` to compensate for a different ancestor owning the scroll.
- Measure and write the real owner directly, then validate its `scrollTop`.

### Pending fence collapses or swallows headings

Symptom:

- The third backtick disappears.
- The cursor line collapses to zero height.
- A heading below a newly typed opener becomes code because a later fence was reused as the closer.

Rule:

- Pending fence is editor state, not permanent Markdown parser truth.
- Keep it visible until Enter confirms a local block.
- Test EOF, heading-above, later-existing-fence, cursor-leaves-opener, and Enter confirmation.

### Stale development server gives false feedback

Symptom:

- Source code, typecheck, and runtime DOM classes contradict each other.
- Even a simple class removal appears to have no effect.

Rule:

- Stop the old Vite process and use a fresh port before changing more code.
- Treat long-running HMR output as suspect for CodeMirror state fields and dynamically loaded editor modules.

### Undo scroll regression

Symptom:

- `Ctrl+Z` content changes correctly but viewport jumps to top.
- Offscreen selection is restored at the top edge.

Rule:

- Reuse the established scroll contract.
- Do not override CodeMirror/ProseMirror selection to fix scroll.
- Test with a long document: force scrollTop to 0, put cursor at bottom, undo, assert viewport returns near cursor.
- For a strict centering assertion, leave enough content after the undo target. At absolute EOF the browser may hit its maximum scroll position, so assert that the cursor is visible and not pinned to the top rather than demanding impossible geometric centering.

### Decoration performance regression

Symptom:

- Switching files hangs.
- Long documents freeze on cursor movement.
- Every selection change feels expensive.

Check for:

```text
state.doc.toString()
analyzeTextBufferMarkdown(...)
scanTextBufferInlineLinksFromSyntaxTree(...)
scanTextBufferTablesFromSyntaxTree(...)
full lines.forEach decoration build
```

Rule:

- Do not claim stability until large documents and file switching are tested.
- Prefer cached analysis, changed-range invalidation, viewport decorations, or separate cheap selection-only decoration paths.

## Minimum Regression Scenarios

Use synthetic or repository-owned representative files first:

```text
tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt
tests/fixtures/rich-edit/00_raw.txt
tests/fixtures/rich-edit/nested_list_quote_code.md
out/outline-repro/duplicate-hierarchy.md
out/outline-repro/fence-heavy.md
out/outline-repro/rapid-outline.md
docs/images/v7.png
docs/images/v8.png
docs/images/v9.png
docs/images/v13.png
docs/images/v14.png
docs/images/v15.mp4
```

Do not use user-owned documents unless the user explicitly authorizes that exact file and test. When authorization is absent, generate a fictional fixture with the same structural properties instead of copying their content.

Must cover:

- Rich input inside code block.
- Typing ``` inside code block.
- Heading after code block remains heading.
- Source mode preserves Markdown.
- Rich mode does not show `#`, opening/closing fence markers, or source active line.
- Language control appears only for current code block.
- ArrowDown from last code line enters language control; ArrowDown from control exits code block.
- `Ctrl+Z` while cursor is offscreen scrolls near cursor.
- Switching files with a long Markdown document does not freeze.
- First/second `Ctrl+A` works for headings, paragraph, list, quote, Setext, empty line, and code.
- Changing language length and immediately clicking a later outline item selects the exact heading.
- `-`, `*`, and `+` preserve their source marker identity.
- Nested list/quote/code background and quote border share the same visual boundary.
- Rich/Source outline jumps update the real `.editor-surface.scrollTop`; rapid clicks end at the last requested heading.
- Typing 1/2/3 backticks at EOF keeps all characters visible; a typed opener above a heading stays pending even when a later code block exists.
- Moving the cursor away from a pending opener does not let it swallow the next heading; Enter creates a local closing fence.
- At approximately 1100px viewport width, shortcut settings remain one row and all controls remain usable.

## Verification Commands

From `apps/serein-desktop/`:

```bash
npm run typecheck
npm run test
npm run build
```

From repo root:

```bash
git -c safe.directory=/home/slam/Project/Serein diff --check
git -c safe.directory=/home/slam/Project/Serein status --short
```

For UI behavior, use a clean Vite server and Playwright. Stop the previous server and start a new port after changing CodeMirror state fields, parser modules, or decorations. Avoid relying on a long-running HMR server because old modules can remain loaded and produce false failures.

Example smoke categories:

- P0 text-buffer smoke: Rich active line, inner fence, Source roundtrip, language control visibility.
- Undo scroll smoke: long document, forced top scroll, bottom cursor, `Ctrl+Z`.
- Performance smoke: open/switch large Markdown files and record visible response time.

If Windows release `.exe` was not tested, say so explicitly.

The test compiler emits ESM into `.test-dist`. Runtime relative imports used by test-compiled modules should use `.js` suffixes. Do not change the project target or test system just to support a new abstraction.

## Completion Report

Report in this order:

1. User-visible behavior restored.
2. Root cause and which duplicate truth was removed.
3. Files changed.
4. Commands and Playwright evidence actually run.
5. Windows/release/performance items still unverified.
6. Git state: commit/tag/push status.

Do not say the single editor is complete while it remains behind an experimental flag or while Windows release and large-document performance are unverified.

## Commit Boundary

Do not stage unrelated work. This repository may contain many AI-generated or user changes.

Before commit:

```bash
git -c safe.directory=/home/slam/Project/Serein status --short
git -c safe.directory=/home/slam/Project/Serein diff
```

Include only relevant source/tests/docs. Do not include generated `dist/`, `target/`, installer files, screenshots unless explicitly needed.
