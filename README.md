# Serein

Serein is a local Markdown desktop writing tool built with Tauri 2, React, TypeScript, and CodeMirror 6.

The current release target is the desktop application in:

```text
apps/serein-desktop/
```

## Features

- Local Markdown and text file editing.
- Vault-style folder browsing with lazy directory loading.
- Source Edit and Rich Edit views backed by one Markdown buffer.
- Standard Markdown tables with row, column, and alignment controls.
- Inline and block MathJax formulas with source-preserving click-to-edit behavior.
- DOCX export with editable native Word equations, numbering, and references.
- Outline, backlinks, and local graph panels.
- Bilingual UI: Simplified Chinese and English.
- Configurable editor fonts, font size, layout, theme, and shortcuts.

## Math syntax

Serein's Rich Edit view and HTML export render math with a bundled MathJax 4 SVG
pipeline. The generated formula markup is self-contained and does not require a
network connection or a second math renderer. DOCX export reuses the same parsed
math semantics and writes native Office Math Markup Language (OMML).

Use standard LaTeX delimiters for new documents:

```latex
Inline formula: \( E = mc^2 \)
```

```latex
\[
E = mc^2
\]
```

Common scientific-writing environments are supported directly:

- Display equations: `equation`, `equation*`.
- Aligned equations: `align`, `align*`, `alignat`, `alignat*`, `flalign`, `flalign*`.
- Long or grouped equations: `multline`, `multline*`, `gather`, `gather*`.
- Inner layouts: `aligned`, `split`, `cases`.
- Matrices: `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `Vmatrix`, `Bmatrix`.
- Numbering and references: `subequations`, `\label`, `\ref`, `\eqref`, `\tag`, `\notag`.

The common `bm` package command `\bm` is accepted as a compatibility alias for
MathJax's `\boldsymbol`, including forms such as `\bm P_0` and `\bm{\theta}`.
Calligraphic symbols such as `\mathcal{CA}` are supported by the bundled math
font and keep normal inline formula dimensions.

For a complete LaTeX document, math-only definitions declared in the preamble
with `\newcommand`, `\renewcommand`, or `\providecommand` are applied to later
formulas in Rich Edit, HTML export, and DOCX export. These definitions are used
only as MathJax/OMML math context and are not written into the exported body.

AMS math and symbol capabilities are enabled internally; Markdown documents do
not need to include `\usepackage{amsmath,amssymb}`. Dollar-delimited `$...$` and
`$$...$$` formulas remain readable for compatibility with existing Markdown,
but they are not the preferred syntax for new scientific writing. The deprecated
`eqnarray` environment is intentionally not supported; use `align` instead.

Current limitation: PDF export preserves formulas as readable LaTeX source text;
it does not yet typeset the MathJax SVG output into the PDF.

## DOCX export

DOCX export creates a standard OOXML Word document. Formulas are stored as
editable OMML equations rather than images or visible LaTeX source. Inline math,
display math, matrices, `cases`, aligned environments, and the other supported
math structures listed above remain editable in Word.

The default DOCX typography follows a Chinese academic-paper baseline: body
Chinese uses SimSun at 12 pt, Latin text and numbers use Times New Roman at
12 pt, level-one headings use SimHei at 16 pt, and level-two headings use
SimHei at 14 pt. Native equations explicitly request Cambria Math so Microsoft
Word and WPS do not choose unrelated body-font fallbacks for mathematical
symbols.

Markdown structure is mapped to native Word structure: `#` through `######`
become Word heading levels, lists use Word numbering, and Markdown tables become
Word tables. If the source contains a complete LaTeX `document` wrapper, export
uses only the content between `\begin{document}` and `\end{document}`; the
preamble and wrapper are not written into the exported body, and the source
Markdown file is not modified. An incomplete wrapper is left untouched to avoid
silently deleting user content.

For complete LaTeX `article`/`report`-style inputs, `\title` plus `\maketitle`
maps to the document title, while `\chapter`, `\section`, `\subsection`,
`\subsubsection`, `\paragraph`, and `\subparagraph` map to native heading
levels. Starred section forms are accepted. Layout packages and arbitrary TeX
document commands are not executed; apart from the supported preamble math
definitions above, the compatibility layer is intentionally limited to document
structure and the supported scientific math syntax.

Numbered equations use Word `SEQ Equation` fields. `\label` destinations become
Word bookmarks, while `\ref` and `\eqref` become `REF` fields. `subequations`
keeps the parent number and lettered child references such as `(1a)` and `(1b)`.
Formula centering and right-aligned numbering use paragraph tab stops rather
than layout tables, so equation rows do not expose table gridlines while being
edited. Large operators such as sums, products, and integrals keep their
following expression inside the native OMML operator body.
The document requests automatic field updates when opened; if Word still shows
stale field results, select the document and press `F9` to refresh them.

## Download

Release downloads will be published here after Windows packaging is verified.

## Build

```bash
cd apps/serein-desktop
npm ci
npm run test
npm run typecheck
npm run build
```

For Tauri static checking:

```bash
cd apps/serein-desktop/src-tauri
env CARGO_TARGET_DIR=/tmp/serein-tauri-target cargo check
```

Windows release packaging should be run on Windows:

```powershell
.\scripts\build_windows.ps1
```

After Windows dependencies have been installed once, `-SkipInstall` can be used
for repeat builds. Do not use `-SkipInstall` with `node_modules` created from
WSL/Linux.
