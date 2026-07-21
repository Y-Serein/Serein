---
name: serein-text-buffer-stability
description: Use this skill whenever work touches Serein's single-editor Markdown text-buffer, Typora-like Rich/Source behavior, Markdown table recognition/completion/column alignment/grid toolbar, Frontmatter visual/source duplication, Ctrl+A semantic selection, CodeMirror history/selection/decoration/keymap precedence, outline jumps or wrong scroll targets, Source gutter desynchronization, typed/pending fences, code language controls, empty code/list/quote deletion or exit, Rich table ghost rows or cursor offsets, hidden-fence copy/cut, system clipboard behavior, list/quote/code nesting, compact minimalist UI, original Markdown markers, EOF exits, stale Vite HMR results, large-document performance, or recovery against commit 93590e3. Trigger even when a minimal pipe row is not recognized, a table aligns in source but not visually, a table toolbar becomes heavy or duplicates controls, Frontmatter appears twice, the editor jumps, copied code gains ``` at the end, Ctrl+X stops working, characters disappear, headings turn into code, `>` keeps nesting after Enter, an empty block cannot be deleted, the menu copies but Ctrl+C does not reach the system clipboard, the fix did nothing on Windows, or the user asks to restore earlier behavior without deleting their work.
---

# Serein Text Buffer Stability

Use this skill when the task touches Serein's current single-editor Markdown text-buffer engine.

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
apps/serein-desktop/src/features/editor-workspace/EditorHost.tsx
apps/serein-desktop/src/App.tsx
apps/serein-desktop/src/styles.css
apps/serein-desktop/tests/text-buffer-markdown.test.mjs
apps/serein-desktop/tests/vault.test.mjs
tests/fixtures/rich-edit/00_raw.txt
tests/fixtures/rich-edit/nested_list_quote_code.md
```

The current architecture uses the text-buffer editor as the editor path. Do not restore the deleted Milkdown/textarea implementation or create a parallel content, selection, history, or save path. Historical commits remain available for comparison and rollback, but rollback means a reviewed commit-level decision, not source duplication.

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
6. Replace whole files only when they belong exclusively to the current editor path. Merge shared App/CSS/tests by reviewed hunk; do not reintroduce deleted legacy editor files as a safety blanket.
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

## Real Typing, Structure Exit, And Desktop Clipboard

Reproduce editing-state bugs with real key events and character-by-character typing. Filling or pasting the final Markdown skips input rules, keymap precedence, pending structures and intermediate selections.

For empty structure blocks:

1. Record Markdown and selection after every relevant Enter/Backspace.
2. Distinguish parser-empty from user-blank. A generated ```` ```bash\n\n``` ```` has an editable blank content line and is not structurally empty.
3. Inspect keymap precedence before adding another Enter branch. Markdown language keymaps may run before the project handler; product exit semantics need the appropriate high precedence.
4. Convert an empty protected code block with one explicit structural transaction. Do not weaken hidden-fence protection for ordinary edits.
5. Cover root quote/list, ordered and unordered markers, nested list+quote, code fence and EOF.

For clipboard regressions:

1. Compare keyboard, DOM `copy/cut`, top-menu command and code-block copy paths.
2. Keep `event.clipboardData` as the event/browser fallback, but use the Tauri clipboard command for the desktop system clipboard.
3. Make native writes awaitable and return success/failure. For cut, delete only after a successful write and only if the selection/text still matches.
4. In browser automation, inject a Tauri invoke mock and assert command name and payload. A successful `navigator.clipboard` call is not proof of Windows WebView2 behavior.
5. Finish with a Windows release paste into an external program when the user can test it; otherwise state that this platform proof remains open.

If the automation cannot find Playwright, a menu, or the expected editor, treat that as a harness failure first. Fix module paths or inspect the rendered page on a clean port before changing product code.

## Single-Editor And Markdown Table Protocol

Use this protocol for table, Frontmatter, formula widget, or editor-architecture work.

### Diagnose Before Editing

When the user asks to confirm a cause or says not to change code:

1. Read the actual project path and current worktree first. Do not infer the runtime path from a parser or an old component name.
2. Reproduce with a fictional document and real keyboard/mouse events. Record Markdown source, CodeMirror selection, rendered DOM, widget count, computed geometry, and page errors.
3. Distinguish the two facts that are often confused:
   - CodeMirror/Lezer syntax-tree recognition.
   - The Rich editor's runtime scanner/completion/widget path.
4. Report the root cause, smallest control variable, alternatives and tradeoffs before editing if the user requested confirmation.

Do not call a visual duplicate two editors until the DOM proves it. A single CodeMirror buffer may intentionally have both a Frontmatter property bar and raw YAML; inspect active/hidden state and source selection before changing architecture.

### Table Semantics

Use standard Markdown semantics as the source of truth:

- Parse and complete a minimal pipe row such as `|1|12|12|` through the actual Rich input path. Do not validate only by injecting final Markdown or inspecting Lezer.
- On the relevant Enter, complete the table structure with a header row, delimiter row and editable blank data row; preserve a trailing blank line when the product contract requires it.
- Store alignment per column in the delimiter row: `:---` for left, `:---:` for center and `---:` for right. Do not create a multi-cell selection model merely to implement alignment.
- Scope alignment actions to the current table and current cursor column. Serialize the Markdown immediately, then apply the same alignment to rendered `th`, `td` and cell inputs.
- Keep table size controls separate from cell selection. The grid is a compact row/column resize picker: hover previews, click confirms, numeric row/column inputs provide direct entry.
- Keep the toolbar visually linear and quiet: grid, left/center/right, `⋯`, delete. Do not duplicate a long “more operations” label beside `⋯`, reintroduce `+↕/−↕/+↔/−↔`, or add multi-cell selection unless the user explicitly changes the requirement.
- Preserve existing Frontmatter CSS and `tags/aliases/status` semantics during architecture cleanup. Do not remove stable visual behavior as an incidental “cleanup”.

### Table Widget Safety

- Replace the complete multi-line table source range with one atomic block widget; never leave hidden source lines as independently measurable/clickable rows.
- Do not use external margin or fake padding on a cross-line editable widget to create spacing. Use real Markdown blank lines so CodeMirror measurement and browser hit-testing agree.
- Commit every structural, content and alignment mutation back to the one Markdown buffer before allowing focus/blur or widget rebuild.
- After each table change, check source roundtrip, row/column count, current-cell focus, table-bottom hit testing, outside-table input, and Rich/Source consistency.

### Visual And Runtime Acceptance

Use a clean Vite port after changing StateField, parser, widget or CSS. Acceptance must include:

```text
CodeMirror instances: 1
Frontmatter property bars: expected count
raw Frontmatter source: visible/hidden according to active state
table toolbar order: grid -> left -> center -> right -> ⋯ -> delete
alignment: delimiter + DOM cells + input all agree
minimal pipe input: completed table + editable blank row
table outside click: does not expose or split hidden source rows
page errors: []
```

Do not accept a fix because only typecheck/build passes. If Vite returns `504 Outdated Optimize Dep`, `ERR_NETWORK_CHANGED`, or a lazy module fails, treat it as a stale/harness failure: stop the old server, clear only generated Vite cache, use a fresh port, and rerun the same smoke.

## Session Closure And Handoff

When the user asks to preserve the session:

1. Update `HANDOFF.md` with current branch/HEAD, worktree status, current user-visible state, root causes, passed/blocked verification, exact next actions, key paths and unresolved risks.
2. Update `docs/runbooks/PROJECT_MEMORY.md` with stable user preferences, mistakes converted into rules, project constraints, known tooling traps and a reusable prompt. Keep immediate WIP in HANDOFF; keep generalizable rules in memory.
3. Extend the nearest existing skill instead of creating a duplicate skill. Add only reusable triggers, protocols, acceptance criteria and failure boundaries.
4. Do not modify source while doing documentation closure unless the user explicitly asks for it. Do not stage, commit, tag or push automatically.
5. Validate the documentation with `git diff --check`, inspect the final headings/content, and report source verification separately from documentation verification.

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
- Large native text paste freezes for tens of seconds or minutes while ordinary file switching remains fast.

Check for:

```text
state.doc.toString()
analyzeTextBufferMarkdown(...)
scanTextBufferInlineLinksFromSyntaxTree(...)
scanTextBufferTablesFromSyntaxTree(...)
full lines.forEach decoration build
paste handler only intercepts files and returns false for text/plain
CodeMirror readChange/findChild DOM mutation work
```

Rule:

- Do not claim stability until large documents and file switching are tested.
- Measure parser, direct transaction, DOM paste, React feedback, selection movement and file switching separately. Do not label the whole editor slow from one path.
- Native `text/plain` paste should prevent the browser default and dispatch one CodeMirror transaction; image paste remains on the attachment import path.
- Keep cross-line structure, block widgets and hidden fences in StateField. Use `ViewPlugin + visibleRanges` only for same-line links, wiki links, emphasis and image presentation.
- Separate selection-only active code/frontmatter decorations from the full structural field so cursor movement does not rebuild every line.
- Prefer cached analysis or changed-range invalidation only after direct paste and viewport decoration are measured; parser rewrite is not the first response when parser time is already milliseconds.
- Add stable performance marks for paste, note open and external markdown sync. For keyboard micro-benchmarks, dispatch inside the page instead of counting Playwright protocol round trips.
- Table widgets may remember ephemeral focus/scroll restoration, but every content/structure/alignment change must serialize immediately to the Markdown buffer.
- Suppress old widget blur commits before a structure-changing dispatch; otherwise DOM teardown can trigger a duplicate update.

### Table source lines remain clickable outside the table

Symptom:

- Rich table leaves a blank region below the visible widget.
- Clicking that region places the apparent caret outside the table, but Enter or typing splits the table and exposes trailing rows as raw Markdown.

Rule:

- A multi-line Rich table must replace its complete Markdown source range with one atomic block decoration from the document StateField.
- Do not mount the widget on the header line and separately hide each source line; hidden text can still leave line breaks, height and selection coordinates.
- Do not add vertical margin to the atomic table widget; CodeMirror height measurement and browser layout will disagree. Do not replace that margin with fake vertical padding, because the padding remains non-editable widget space.
- Let real Markdown blank lines provide editable spacing before and after the table.
- Validate DOM line count/height and click immediately below the widget. The table row count and Source Markdown must remain unchanged after ordinary outside input.

### Partial code selection copies a hidden fence and cut stops working

Symptom:

- Copying the last visible code lines appends a hidden closing fence.
- Ctrl+X writes clipboard data but does not delete the selection; subsequent typing leaves stale text or lands at the fence boundary.

Rule:

- Map Rich selections to visible source ranges before copy or cut. Remove unmatched hidden opener/closer lines, but keep paired fences for a complete block or whole-document copy.
- Cut must delete exactly the mapped visible ranges. Do not weaken ordinary fence protection.
- When a partial cut reaches the closing fence, preserve one structural newline so the cursor remains on a valid empty code line for immediate continued typing.
- Verify DOM copy/cut, top-menu commands and Tauri clipboard payload with endpoints on the last line, language control, blank line after the block and following text.

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
Use screenshots/videos only as structural references; reproduce with fictional Markdown before editing.
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
- A fictional 5000-line native paste is prevented, copied back intact, produces a performance entry, and completes without minute-scale freezing.
- On the same long document, repeated ArrowUp/ArrowDown remains responsive after inline decorations move to `visibleRanges`.
- Table keyboard flow covers Tab/Shift+Tab, Enter append row, ArrowDown/Escape exit, add/delete/move row and column, alignment serialization, uncommitted cell preservation, focus restoration and horizontal scroll restoration.
- A blank fenced block is removed by the first Backspace from its blank content line without exposing or corrupting fences.
- Quote/list/nested list+quote continue once on the first Enter and exit on the next empty Enter without producing a `>` indentation staircase.
- Rich and Source modes in the single Text Buffer editor invoke `desktop_write_clipboard_text`; cut preserves content until native write success and does not delete after selection drift.
- A Rich selection ending after the hidden closing fence copies no unmatched fence; Ctrl+X preserves the block structure and immediate continued typing stays inside the code block.

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

Smoke categories: P0 Rich/Source/fence/language behavior; long-document undo scroll; large-file open/switch/paste performance.

If Windows release `.exe` was not tested, say so explicitly.

The test compiler emits ESM into `.test-dist`. Runtime relative imports used by test-compiled modules should use `.js` suffixes. Do not change the project target or test system just to support a new abstraction.

## Completion Report

Report in this order: user-visible result; root cause/duplicate truth removed; files changed; commands and Playwright evidence; Windows/release/performance gaps; commit/tag/push status.

Do not call the single editor release-ready merely because the architecture is unified. Windows release behavior, large-document performance, real system clipboard, IME, save and user-visible Rich/Source regressions must still be verified.

## Commit Boundary

Do not stage unrelated work. This repository may contain many AI-generated or user changes.

Before commit:

```bash
git -c safe.directory=/home/slam/Project/Serein status --short
git -c safe.directory=/home/slam/Project/Serein diff
```

Include only relevant source/tests/docs. Do not include generated `dist/`, `target/`, installer files, screenshots unless explicitly needed.
