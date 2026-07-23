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

## Containerized development environment

The repository includes a reproducible Linux/WSL development container. It is
a command-line build and static-check environment, not a production service,
and it does not require VS Code, Node.js, npm, or Rust on the host. Docker
Compose is used internally, while `scripts/dev_container.sh` keeps the normal
workflow to one command.

The container pins Node `22.22.2` and Rust `1.95.0`, installs the Linux system
libraries required by Tauri 2, and keeps Linux dependencies and generated
output separate from the Windows release environment.

### Prerequisites

- Git.
- Docker Engine on Linux, or Docker Desktop with WSL integration enabled on
  Windows.
- Docker Compose v2 (`docker compose`).

On Windows, run these commands from WSL and clone the repository into the WSL
Linux filesystem, such as `~/projects/Serein`, rather than `/mnt/c`, to avoid
cross-filesystem performance and permission issues.

Confirm that the Docker client can reach the Docker engine before continuing:

```bash
docker version
docker compose version
```

### Clone and create the environment

```bash
git clone https://github.com/Y-Serein/Serein.git
cd Serein
./scripts/dev_container.sh
```

The first build downloads the Ubuntu base image, Tauri system libraries, Node,
Rust, and project dependencies. It can take several minutes depending on the
network. Later runs reuse the Docker image and dependency caches.

The command opens a non-root shell in the repository. On exit, the temporary
container is removed automatically; source files remain in Git and dependency
caches remain in Docker volumes. `npm ci` runs automatically only when the
dependency cache is new or `package-lock.json` changed.

Inside the shell, verify the pinned toolchains or run project checks:

```bash
node --version
rustc --version
cargo --version

cd apps/serein-desktop
npm run test
npm run typecheck
npm run build

cd src-tauri
cargo check
```

The same checks can be launched from the host in one command:

```bash
./scripts/dev_container.sh bash -lc '
  set -e
  cd /workspace/apps/serein-desktop
  npm run test
  npm run typecheck
  npm run build
  cd src-tauri
  cargo check
'
```

For the less common browser-only Vite workflow, explicitly publish the service
port:

```bash
docker compose -f compose.dev.yaml run --rm --build --service-ports dev bash -lc '
  cd /workspace/apps/serein-desktop
  npm run dev -- --host 0.0.0.0
'
```

Then open `http://127.0.0.1:1420`. This does not launch or validate the Tauri
desktop shell.

Leave the shell with `exit`. The temporary container is removed automatically.

The container stores these paths in Linux-only Docker volumes:

- `apps/serein-desktop/node_modules`
- `apps/serein-desktop/dist`
- npm cache
- Cargo registry and Git cache
- Linux Tauri target output

The source repository remains bind-mounted from the host. Docker images and
volumes are not source backups, and real user Vaults should not be mounted into
automated container tests.

VS Code, JetBrains, or another Dev Container-compatible IDE may open the same
Compose-backed configuration as an optional interface, but ordinary users do
not need it.
See [`docs/runbooks/DEV_CONTAINER.md`](docs/runbooks/DEV_CONTAINER.md) for the
detailed scope and boundaries.

## Native build

When not using the container, install the project dependencies on the current
host operating system before running the checks:

```bash
cd apps/serein-desktop
npm ci
npm run test
npm run typecheck
npm run build
```

For Linux Tauri static checking:

```bash
cd apps/serein-desktop/src-tauri
env CARGO_TARGET_DIR=/tmp/serein-tauri-target cargo check
```

## Windows release packaging

The Dev Container does not replace Windows Tauri/WebView2 validation or produce
the final Windows installer. Windows release packaging must be run from Windows
PowerShell with Windows-side dependencies:

```powershell
.\scripts\build_windows.ps1
```

After Windows dependencies have been installed once, `-SkipInstall` can be used
for repeat builds. Do not use `-SkipInstall` with `node_modules` created from
WSL/Linux.
