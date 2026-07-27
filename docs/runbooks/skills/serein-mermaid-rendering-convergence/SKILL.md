---
name: serein-mermaid-rendering-convergence
description: Use this skill whenever Serein has Mermaid, flowchart, sequence diagram, mindmap, Markdown diagram fences, raw Mermaid source instead of a diagram, clipped diagrams, tiny text, huge blank space, oversized borders, fixed 600px sizing, abnormal SVG viewBox/getBBox, WebView2-only rendering differences, HTML/PDF Mermaid export, or an installed Windows build that looks unchanged after a debug fix. It guides evidence-first SVG and layout diagnosis, content-driven responsive sizing, dirty-worktree protection, real Windows release verification, and handoff/memory convergence. Trigger even when the user only gives screenshots or says “图太小、页面太长、显示不全、更新后没区别”。
---

# Serein Mermaid Rendering Convergence

Use this skill to converge Mermaid rendering without accumulating fixed heights, short/long diagram branches, or CSS patches that hide bad SVG geometry.

## Objective

Deliver this user-visible contract:

```text
Markdown Mermaid source remains the only saved truth
  -> Mermaid renders one SVG
  -> SVG coordinates fit actual visible content
  -> container uses the content's natural aspect ratio
  -> available width is the only responsive constraint
  -> insufficient width causes proportional scaling
  -> following Markdown content stays close to the diagram
```

Do not interpret “自适应” as a fixed maximum height or a growing table of diagram-size cases.

## Start Here

Before changing code:

1. Read:
   - `AGENTS.md`
   - `HANDOFF.md`
   - `docs/runbooks/PROJECT_MEMORY.md`
   - `docs/runbooks/KNOWN_FAILURES.md`
2. Run:

```bash
python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora
git -c safe.directory=/home/slam/Project/Serein status --short
git -c safe.directory=/home/slam/Project/Serein log -1 --oneline
```

3. Inspect the current implementation and fixture:

```text
apps/serein-desktop/src/shared/mermaid.ts
apps/serein-desktop/src/components/MarkdownTextBufferEditor.tsx
apps/serein-desktop/src/styles.css
apps/serein-desktop/src/App.tsx
apps/serein-desktop/src/export/markdownExport.ts
apps/serein-desktop/src/export/pdfExport.ts
apps/serein-desktop/tests/markdown-export.test.mjs
tests/fixtures/rich-edit/mermaid_messy_test.md
scripts/build_windows.ps1
```

4. State the control loop before editing:
   - Goal: exact visible behavior.
   - State: source, screenshot, SVG metrics, running executable and package time.
   - Error: which layer differs from the goal.
   - Control action: smallest shared-root change.
   - Feedback: exact DOM/build/install evidence.

Protect all existing WIP. Never use reset, restore, checkout, or `git add .` to simplify the worktree.

## User Contract

Respect these stable preferences:

- Use Chinese and lead with the result.
- The user accepts disagreement when it includes evidence, alternatives and tradeoffs.
- Treat screenshots and installed Windows behavior as primary evidence for visual claims.
- Do not claim success because source changed, tests passed, or HMR looks correct.
- Do not classify diagrams as “short” or “long”. Derive size from real SVG content.
- Do not use fixed `600px`, arbitrary max-height, large minimum height, or decorative frames to make the layout look stable.
- Use Typora, Obsidian, GitHub Markdown and Mermaid's supported configuration as behavioral references; do not copy them blindly.
- Use realistic messy Markdown, including invalid and unfinished syntax. Do not make the test file artificially compliant.
- Protect save, Rich/Plain Edit, links, code blocks, tables, images, Vault I/O and neighboring editor behavior.

## Correct Rendering Semantics

For a valid diagram:

- The SVG viewBox should cover visible content plus small intentional padding.
- The figure width should be `min(natural SVG width, available editor width)`.
- Height should follow the SVG aspect ratio; do not set a separate fixed height.
- Normal diagrams should not be rewritten merely because their bbox differs slightly from viewBox.
- When content is wider than the editor, proportional scaling is acceptable; the coordinate system itself must still be correct.
- The gap to following Markdown should come from normal document spacing, not a reserved diagram canvas.

For invalid syntax:

- Keep the failure visible and understandable.
- Preserve the Mermaid source so the user can click or move selection back to edit it.
- Do not require one exact internal error DOM; validate the user-visible fallback.

## Diagnose By Layer

Do not edit CSS until the failing layer is known.

### 1. Markdown Fence And Language Recognition

Check:

- opening and closing fence boundaries;
- `mermaid` and case variants such as `MERMAID`;
- nested list/quote prefixes;
- unfinished fences;
- selection touching the code block, which may intentionally reveal source;
- invalid Mermaid type versus valid Markdown fence.

The scanner must preserve source offsets and indentation. A parser failure is not an SVG size failure.

### 2. Mermaid Render Output

Record:

```text
svg width/height attributes
svg viewBox
svg.getBBox()
svg.getBoundingClientRect()
direct child/group bbox
node transforms
text computed font-size and rendered rect
```

If viewBox is far larger than `getBBox()`, fix the internal coordinate system before adjusting CSS.

Known Windows WebView2 example:

```text
bad viewBox: approximately 2063 x 2064
actual bbox: approximately 836 x 120
corrected viewBox with padding: approximately 852 x 136
```

### 3. Layout Algorithm

If viewBox and bbox agree but both are implausibly large, inspect node transforms and layout selection.

Known mindmap example:

```text
cose-bilkent: approximately 2335 x 2387 for 10 nodes
dagre: approximately 697 x 204
```

Using `dagre` here is a semantic layout choice for deterministic compact hierarchy, not a short/long size branch. State the tradeoff: it is more tree-like and less freely radial.

### 4. Responsive Container

Only after SVG geometry and layout are sound, inspect:

```text
.serein-buffer-mermaid
.serein-buffer-mermaid-diagram
.serein-buffer-mermaid-diagram svg
available editor width
figure inline width
overflow owner
figure-to-next-line gap
```

Avoid independent width and height constraints that distort aspect ratio.

### 5. Release And Installed Version

Identify every running process by PID and executable path. Distinguish:

```text
Vite/HMR frontend
Tauri debug exe
new release exe
NSIS installer
currently installed exe
```

Compare timestamps and SHA-256. A debug fix cannot exist in an installer built earlier than the source change.

Do not stop the user's formal process or overwrite an installed app while unsaved content may exist. Only close temporary processes you started.

## SVG Normalization Rules

Keep normalization in `src/shared/mermaid.ts` so Rich, HTML and PDF share one result.

- Measure the SVG in an attached offscreen host so `getBBox()` is meaningful.
- Use synchronous layout measurement. Do not unconditionally await `requestAnimationFrame`; hidden/minimized desktop windows may pause rAF and hang export.
- Add small symmetric padding around the measured bounds.
- Rewrite viewBox only when width/height and area ratios show a clearly oversized canvas.
- Preserve normal viewBoxes to avoid clipping arrowheads, markers, labels, shadows and diagram-specific margins.
- Keep the render queue so multiple Mermaid renders do not corrupt shared Mermaid configuration/state.
- Keep `securityLevel: "strict"` unless the product security boundary is deliberately redesigned.

## Rich Edit Rules

- Mermaid remains a fenced Markdown code block in the document buffer.
- The widget is an atomic visual replacement only while selection is outside the block.
- Click or selection must return the user to editable source.
- Do not create a second Mermaid document model, history, selection or save path.
- Resize handling may update figure width and request editor measurement; it must not rewrite Markdown.
- Loading/error placeholders may have a small minimum height, but successful diagrams must use natural content height.

## Export Rules

- HTML and PDF should reuse SVG produced by the shared renderer.
- Keep Mermaid scan order stable so rendered blocks map to the correct fences.
- Error fallback must include readable information and original source.
- Validate hidden/minimized-window export because it exercises offscreen SVG measurement.
- Do not claim DOCX Mermaid support unless image/vector insertion, pagination and Word/WPS behavior were separately implemented and tested.

## Failed Approaches To Avoid

- Fixed `600px` height or max-height.
- Short-diagram versus long-diagram thresholds.
- CSS-only shrinking of a bad internal viewBox.
- Large borders/background cards that reserve space unrelated to content.
- Increasing font size to compensate for an oversized coordinate system.
- Cropping every viewBox without an anomaly threshold.
- Treating one corrected flowchart as proof that mindmap uses a correct layout.
- Declaring success from Linux, Chromium, HMR or a debug exe before rebuilding/installing Windows release.
- Assuming a specific number or shape of error widgets for invalid syntax.

## Regression Matrix

Use `tests/fixtures/rich-edit/mermaid_messy_test.md` and preserve its messy nature. Cover at least:

1. Normal Chinese flowchart.
2. Long Chinese/English labels and punctuation.
3. Sequence diagram.
4. Mindmap with several branches.
5. Uppercase `MERMAID` language info.
6. Missing diagram type.
7. Unfinished Mermaid syntax and unclosed fence.
8. Ordinary Markdown link, inline code and table near diagrams.
9. Narrow and wider editor viewports.
10. HTML/PDF render or explicit statement that export was not validated.

For each valid SVG, capture viewBox, bbox, rendered rect and content-to-viewBox ratios. Also inspect a screenshot; metrics alone do not judge readable composition.

## Verification Protocol

Run:

```bash
cd /home/slam/Project/Serein/apps/serein-desktop
npm run typecheck
npm run test
npm run build
git -c safe.directory=/home/slam/Project/Serein diff --check
```

For UI claims, use a clean or explicitly identified Windows WebView2 instance and record:

```text
process PID and executable path
source/build/install timestamps
SVG metrics for multiple diagram types
visual screenshot
console/page errors
following paragraph gap
user-installed release feedback
```

For the final Windows artifact:

```powershell
cd C:\Serein_Y\Project\Serein
.\scripts\build_windows.ps1 -SkipInstall
```

Verify the root installer and NSIS bundle hashes match. State whether the user actually installed and tested it.

## Completion And Handoff

Do not mark the visual task complete until the latest installer is newer than the fix and the same reproduction document passes in the installed app.

At the end, report:

- visible behavior achieved;
- root causes, separated by layer;
- files changed;
- commands and Windows checks run;
- installer path/time/hash;
- user verification status;
- uncommitted/tag/push state;
- export paths not yet visually verified.

For a long task, update `HANDOFF.md` and `docs/runbooks/PROJECT_MEMORY.md`. Keep the reusable one-shot prompt in `references/one-shot-prompt.md`.

## Bundled Resources

- Read `references/one-shot-prompt.md` when the user wants a single prompt to reproduce this workflow.
- Use `evals/evals.json` as the initial qualitative regression set. It is a draft until with-skill/baseline runs and human review are completed.
