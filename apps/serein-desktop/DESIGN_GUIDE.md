# Serein Design Guide

This document records the product design details that should stay consistent as Serein evolves. Keep it updated whenever visible UI behavior changes.

## Product Feel

Serein should feel like a calm local writing tool, not a marketing page, dashboard, or demo toy.

- Quiet, focused, document-first.
- Local files and Vault safety should feel trustworthy.
- UI density should support repeated daily use.
- Decorative effects must not compete with reading or editing.
- Motion should make state changes legible, not show off.

## Layout Principles

- Keep the main structure stable: left utility rail, editor in the center, Knowledge Panel docked on the right or floating above the editor.
- The left rail has two primary modes: `Files` and `Outline`.
- Do not re-center the editor based on total window width. The editor should keep a stable left gap relative to the editor column.
- Right-side content should behave like a utility panel: compact, scannable, and predictable.
- Avoid nested cards. Panels are structural areas; cards are only for repeated items or dialogs.
- Long paths, long titles, long words, and code blocks must never stretch the layout.
- Important controls should stay in familiar places: file actions left/top, editor in center, knowledge tools right.

## Motion Rules

Use motion to answer: "Where did this come from, and what changed?"

Recommended timing:

- Fast feedback: `120ms`
- Content reveal: `180ms`
- Panel enter/exit: `220ms`

Current tokens:

```css
--motion-fast: 120ms;
--motion-medium: 180ms;
--motion-panel: 220ms;
--ease-out: cubic-bezier(.16, 1, .3, 1);
--ease-standard: cubic-bezier(.2, 0, 0, 1);
```

Rules:

- Menus should fade/slide in quickly.
- Panels should enter from their physical side.
- Tab content should rise/fade in, lightly.
- Graph nodes and edges may fade/scale in, but should not bounce.
- Hover feedback should be immediate and subtle.
- Avoid long animations over `250ms` for routine desktop interactions.
- Always respect `prefers-reduced-motion`.

## Typography

- UI text should be compact and calm.
- Editor text can be more literary and comfortable.
- Do not use large hero-style text inside panels, cards, settings, or utility surfaces.
- Use monospace only for paths, shortcuts, code, and technical values.
- Avoid negative letter spacing.

## Color

Use restrained document colors:

- Paper and panel colors should create depth without feeling like floating cards.
- Accent color marks state, not decoration.
- Cool accent is suitable for active file, links, graph nodes, focus rings.
- Warm accent is suitable for warning, delete, and error states.
- Do not drift into a one-note palette dominated by purple, dark blue, beige, or coffee tones.

## Interaction Details

Window:

- Title bar and empty menu-bar area should drag the window.
- Menu buttons must stay clickable and not become drag handles.
- Maximize/restore must be explicit and debounced; avoid raw toggle behavior that can double-trigger.

Vault tree:

- Directory loading is lazy.
- Avoid recursive full-tree scans for normal navigation.
- Row hover should reveal actions gently, without layout shift.
- Active and selected states must be visually distinct.
- Rename/delete controls should not dominate the tree.

Editor:

- Plain Edit and Rich Edit should share width, left gap, wrapping, and overflow behavior.
- Rich Edit links should visibly look like links.
- Code blocks should not break the editor width.
- Blockquotes should be complete block areas and handle nested content.

Knowledge Panel:

- Keep tabs limited to core knowledge tools unless a new tool is genuinely useful.
- Outline belongs in the left rail beside Files, not in the right Knowledge Panel.
- Backlinks must come from real Vault index data.
- Graph must come from real Markdown links, not static decoration.
- Empty states should explain what is missing: no Vault, indexing, unresolved link, or no links.
- Unresolved links should be visible when they explain why Graph has no edge.
- Knowledge Panel can be docked on the right or floated as a movable panel. Floating panels need a clear title bar and an obvious Dock action.

Settings:

- Settings should slide in from the right.
- Controls should be practical and compact.
- Avoid explanatory marketing copy inside the app.

## Markdown and Graph Rules

Supported index inputs:

```markdown
[[note]]
[[note#heading]]
[[note|alias]]
[text](path.md)
[text](../relative/path.md)
[text](./)
#tag
```

Graph rules:

- Graph only connects file nodes.
- Directory links like `[q](./)` should resolve to `index.md`, `index.markdown`, `index.txt`, `README.md`, `README.markdown`, or `README.txt`.
- If a directory has no index/readme file, show it as unresolved.
- Do not invent graph edges.

## Accessibility and Safety

- Every interactive surface needs visible focus.
- Small animations must degrade under `prefers-reduced-motion`.
- Deleting files is real filesystem deletion; keep confirmation clear.
- File operations must not silently fail.
- Large Vault handling must protect responsiveness.

## Design Review Checklist

Before shipping visible UI changes:

- Does the change preserve the three-pane product model?
- Does text fit at narrow and wide desktop widths?
- Are empty/loading/error states explicit?
- Does motion make the change clearer without slowing use?
- Does it still work with reduced motion?
- Are hover and focus states visible?
- Does it avoid fake data, fake graph edges, or decorative-only widgets?
- Did we avoid touching the old HTML prototype?
- Did TypeScript and Rust checks pass if code changed?

## Current Known Limits

- Release `.exe` still needs Windows GUI validation after UI changes.
- Graph is local and minimal, not a global graph.
- Vault index is in memory, not SQLite or persistent search.
- Large Vault behavior is bounded by index limits and skipped directories.
