# Serein Linux / WSL Dev Container

This container provides a reproducible Linux command-line development and
static-check environment for Serein. It is intentionally not the Windows
release environment. The normal user entry point is
`scripts/dev_container.sh`; Docker Compose details are kept behind the script.

## Scope

The container supports:

- `npm ci`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- Linux `cargo check`
- Vite development server on port `1420`

The container does not replace:

- Windows Tauri/WebView2 validation
- Windows IME, system clipboard, tray, global shortcut, or multi-window checks
- Microsoft Word and WPS DOCX validation
- `scripts/build_windows.ps1` and the final NSIS installer build

Do not mount a real user Vault into automated container tests. Use repository
fixtures or completely fictional Markdown documents.

## Prerequisites

Install Git plus Docker Engine on Linux, or Docker Desktop with WSL integration
on Windows. Docker Compose v2 must be available as `docker compose`. Host Node,
npm, Rust, and VS Code are not required.

Verify the engine and Compose plugin:

```bash
docker version
docker compose version
```

On Windows, run the Linux container workflow inside WSL and keep the clone in
the WSL filesystem, for example `~/projects/Serein`, instead of `/mnt/c`.

The image pins Node `22.22.2` and Rust `1.95.0`, matching the toolchains used
when this configuration was introduced. Rust is downloaded from the official
Rust distribution service with bounded retries and timeouts; LLDB is not
installed in this baseline.

## Takeover checklist

A new developer or agent should be able to resume with this sequence:

1. Read `AGENTS.md`, `HANDOFF.md`, and `docs/runbooks/KNOWN_FAILURES.md`.
2. On the configured Serein workstation, run the project preflight. External
   clones that do not contain this shared tool can continue with step 3:

   ```bash
   python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora
   ```

3. Confirm Docker is reachable with `docker version` and
   `docker compose version`.
4. Open the isolated development shell with `./scripts/dev_container.sh`.
5. Run the checks in the **Verify** section before changing code.
6. Keep Windows release work separate: use Windows PowerShell and
   `scripts/build_windows.ps1` for the final `.exe`.

Expected normal state after leaving the shell:

- No Serein development container remains running.
- No host port is published unless the explicit Vite command was used.
- Docker volumes retain only Linux npm/Cargo dependencies and generated output.
- The Git working tree remains the source of truth.

## Clone and start

```bash
git clone https://github.com/Y-Serein/Serein.git
cd Serein
./scripts/dev_container.sh
```

On first use, the command:

1. Installs the Linux system libraries required for Tauri static checking.
2. Installs the pinned Rust toolchain, `rustfmt`, and `clippy`.
3. Creates isolated Docker volumes for Linux dependencies and build caches.
4. Runs `npm ci` in `apps/serein-desktop`.

The first build downloads the base image, Ubuntu packages, Node, Rust, npm
dependencies, and later Rust crates. Subsequent runs reuse the image and named
volumes. The shell runs as a non-root account, and exiting it removes the
temporary container automatically.

## Verify

Inside the container:

```bash
cd apps/serein-desktop
npm run test
npm run typecheck
npm run build

cd src-tauri
cargo check
```

`CARGO_TARGET_DIR` is already set to a Docker volume, so Rust output does not
pollute `apps/serein-desktop/src-tauri/target`.

The same verification can be invoked directly from the host without first
opening an interactive shell:

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

For browser-only Vite inspection, run:

```bash
docker compose -f compose.dev.yaml run --rm --build --service-ports dev bash -lc '
  cd /workspace/apps/serein-desktop
  npm run dev -- --host 0.0.0.0
'
```

Open `http://127.0.0.1:1420`. This does not launch the Tauri desktop shell.

## Dependency isolation

The following data is stored in Linux-only Docker volumes:

- `apps/serein-desktop/node_modules`
- `apps/serein-desktop/dist`
- npm cache
- Cargo registry and Git cache
- Linux Tauri target output

Do not reuse the container's `node_modules` for Windows packaging. The Windows
build requires the Windows Tauri CLI package and its own native dependencies.

The entry point records the current `package-lock.json` hash inside the
dependency volume. The next script run after the lockfile changes executes
`npm ci` again. To force the same check explicitly:

```bash
./scripts/dev_container.sh bash .devcontainer/post-create.sh /workspace
```

On Windows, use a Windows-side dependency installation and run:

```powershell
.\scripts\build_windows.ps1
```

The existing `-SkipInstall` warning still applies: never use it with
`node_modules` installed from Linux, WSL, or this container.

## Stop and clean

Exit the shell normally; `--rm` removes the temporary container. Named volumes
retain npm and Cargo downloads. Only when a fully clean reinstall is intended,
delete those caches explicitly:

```bash
docker compose -f compose.dev.yaml down --volumes
```

The `--volumes` form is destructive for container-only dependency/build caches;
it does not delete the bind-mounted source repository.

## Common problems

### Docker socket permission denied

If the script reports `permission denied while trying to connect to the Docker
API`, verify Docker Desktop is running and WSL integration is enabled for the
current distribution. On native Linux, verify the current account is allowed
to use the Docker Engine. Do not work around this by running the whole project
as root.

### First run is slow

The first run downloads Ubuntu/Tauri libraries, Node, Rust, npm packages, and
Rust crates. Later runs reuse the image and named volumes. A slow first run is
not evidence that a background Serein service has been installed.

### The shell script is not executable

The repository records `scripts/dev_container.sh` as executable. If a checkout
loses the executable bit, use this equivalent fallback:

```bash
bash scripts/dev_container.sh
```

### Dependencies do not match the lockfile

The entry point compares a stored hash with `package-lock.json` and runs
`npm ci` when needed. Delete Docker volumes only if this automatic refresh
fails repeatedly; doing so discards caches and forces a complete reinstall.

### Confirm nothing is still running

After leaving the one-off shell, this command should show no Serein service
container:

```bash
docker compose -f compose.dev.yaml ps --all
```

## Optional Dev Container client

`.devcontainer/devcontainer.json` points to `compose.dev.yaml`. VS Code,
JetBrains, or another compatible client may open it, but this is optional and
does not create a second toolchain definition.

## Known boundaries

- Running the Linux Tauri GUI from the container is not part of this baseline.
- Linux `cargo check` does not compile every Windows-only `#[cfg]` path.
- A future Windows cross-compilation container must use separate caches and is
  an additional check, not a replacement for Windows release validation.
- Docker images and volumes are not source backups. Use Git or another explicit
  backup path before switching operating systems.
- Browser-only Vite runs publish host port `1420` only when the explicit
  `--service-ports` command is used. Set `SEREIN_VITE_PORT` if that port is
  already occupied.
