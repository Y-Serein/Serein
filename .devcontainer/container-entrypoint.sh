#!/usr/bin/env bash

set -euo pipefail

workspace="${SEREIN_WORKSPACE:-/workspace}"
workspace_setup="${workspace}/.devcontainer/post-create.sh"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Serein container entry point must start through the image's sudo wrapper." >&2
  exit 1
fi

if [[ ! -f "${workspace_setup}" ]]; then
  echo "Serein container setup script not found: ${workspace_setup}" >&2
  exit 1
fi

export HOME=/home/vscode
export USER=vscode
export PATH="/usr/local/cargo/bin:${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"

gosu vscode bash "${workspace_setup}" "${workspace}"
exec gosu vscode "$@"
