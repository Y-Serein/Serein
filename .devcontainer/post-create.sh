#!/usr/bin/env bash

set -euo pipefail

repo_root="${1:-$(pwd)}"
app_dir="${repo_root}/apps/serein-desktop"

if [[ ! -f "${app_dir}/package-lock.json" ]]; then
  echo "Serein package-lock.json not found under: ${app_dir}" >&2
  exit 1
fi

# The workspace is bind-mounted after the image is built, so its named volumes
# may initially be owned by root even though the container uses vscode.
sudo mkdir -p \
  "${app_dir}/node_modules" \
  "${app_dir}/dist" \
  "${npm_config_cache}" \
  "${CARGO_HOME}/git" \
  "${CARGO_HOME}/registry" \
  "${CARGO_TARGET_DIR}"

sudo chown "$(id -u):$(id -g)" \
  "${app_dir}/node_modules" \
  "${app_dir}/dist" \
  "${npm_config_cache}" \
  "${CARGO_HOME}" \
  "${CARGO_HOME}/git" \
  "${CARGO_HOME}/registry" \
  "${CARGO_TARGET_DIR}"

lock_hash="$(sha256sum "${app_dir}/package-lock.json" | cut -d' ' -f1)"
install_marker="${app_dir}/node_modules/.serein-package-lock.sha256"
installed_hash=""

if [[ -f "${install_marker}" ]]; then
  installed_hash="$(<"${install_marker}")"
fi

if [[ "${installed_hash}" != "${lock_hash}" || ! -f "${app_dir}/node_modules/@tauri-apps/cli/tauri.js" ]]; then
  cd "${app_dir}"
  npm ci
  printf '%s\n' "${lock_hash}" > "${install_marker}"
else
  echo "Serein npm dependencies already match package-lock.json; skipping npm ci."
fi

echo "Serein development container is ready."
echo "Node:  $(node --version)"
echo "npm:   $(npm --version)"
echo "Rust:  $(rustc --version)"
echo "Cargo: $(cargo --version)"
