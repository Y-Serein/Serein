FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG DEBIAN_FRONTEND=noninteractive
ARG TARGETARCH

# Docker Desktop networks can occasionally truncate large apt responses. Keep
# the official Ubuntu repositories, but use HTTPS and make cold builds retry
# transient mirror failures instead of discarding the entire dependency layer.
RUN sed -i \
        -e 's|http://archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
        -e 's|http://security.ubuntu.com/ubuntu|https://security.ubuntu.com/ubuntu|g' \
        /etc/apt/sources.list.d/ubuntu.sources \
    && printf '%s\n' \
        'Acquire::Retries "8";' \
        'Acquire::http::Timeout "120";' \
        'Acquire::https::Timeout "120";' \
        'Acquire::Queue-Mode "access";' \
        > /etc/apt/apt.conf.d/80-serein-network

# Linux-only development and static-check dependencies for Tauri 2.
# Windows release packaging remains on the Windows host/CI.
RUN apt-get update \
    && apt-get install -y --fix-missing --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        file \
        gosu \
        libayatana-appindicator3-dev \
        libgtk-3-dev \
        librsvg2-dev \
        libssl-dev \
        libwebkit2gtk-4.1-dev \
        libxdo-dev \
        patchelf \
        pkg-config \
        wget \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

ARG NODE_VERSION=22.22.2

# Install Node directly in the image so Docker Compose users do not need the
# Dev Container feature runner or Node/npm on the host.
RUN target_arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "${target_arch}" in \
        amd64) node_arch="x64" ;; \
        arm64) node_arch="arm64" ;; \
        *) echo "Unsupported Node architecture: ${target_arch}" >&2; exit 1 ;; \
    esac \
    && node_archive="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
    && curl \
        --proto '=https' \
        --tlsv1.2 \
        --retry 8 \
        --retry-all-errors \
        --retry-delay 5 \
        --connect-timeout 30 \
        --max-time 300 \
        --fail \
        --location \
        --silent \
        --show-error \
        "https://nodejs.org/dist/v${NODE_VERSION}/${node_archive}" \
        --output "/tmp/${node_archive}" \
    && curl \
        --proto '=https' \
        --tlsv1.2 \
        --retry 8 \
        --retry-all-errors \
        --retry-delay 5 \
        --connect-timeout 30 \
        --max-time 120 \
        --fail \
        --location \
        --silent \
        --show-error \
        "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" \
        --output /tmp/node-shasums.txt \
    && grep " ${node_archive}$" /tmp/node-shasums.txt > /tmp/node-sha256.txt \
    && cd /tmp \
    && sha256sum --check node-sha256.txt \
    && tar -xJf "${node_archive}" -C /usr/local --strip-components=1 \
    && rm -f "${node_archive}" node-shasums.txt node-sha256.txt \
    && node --version \
    && npm --version

ENV RUSTUP_HOME=/usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo
ENV PATH=/usr/local/cargo/bin:${PATH}
ENV RUSTUP_DOWNLOAD_TIMEOUT=120
ENV RUSTUP_MAX_RETRIES=8
ENV RUSTUP_CONCURRENT_DOWNLOADS=1
ENV RUSTUP_TERM_PROGRESS_WHEN=always

# Install only the pinned Rust toolchain and developer components required by
# this repository. Explicit download limits prevent a flaky connection from
# hanging a BuildKit layer indefinitely. The Dev Container Rust feature is not
# used because it also installs LLDB and Python debug packages (roughly 390 MB).
RUN target_arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "${target_arch}" in \
        amd64) rust_arch="x86_64" ;; \
        arm64) rust_arch="aarch64" ;; \
        *) echo "Unsupported Rust architecture: ${target_arch}" >&2; exit 1 ;; \
    esac \
    && curl \
        --proto '=https' \
        --tlsv1.2 \
        --retry 8 \
        --retry-all-errors \
        --retry-delay 5 \
        --connect-timeout 30 \
        --max-time 300 \
        --fail \
        --location \
        --silent \
        --show-error \
        "https://static.rust-lang.org/rustup/dist/${rust_arch}-unknown-linux-gnu/rustup-init" \
        --output /tmp/rustup-init \
    && chmod +x /tmp/rustup-init \
    && /tmp/rustup-init \
        -y \
        --no-modify-path \
        --profile minimal \
        --default-toolchain 1.95.0 \
        --component rustfmt \
        --component clippy \
    && rm -f /tmp/rustup-init \
    && rustc --version \
    && cargo --version

# Named volumes inherit these permissions on first creation. This keeps
# generated dependencies and build output writable by the non-root user.
RUN mkdir -p \
        /home/vscode/.cache/npm \
        /home/vscode/.cache/serein-tauri-target \
        /home/vscode/.cargo/git \
        /home/vscode/.cargo/registry \
    && chown -R vscode:vscode /home/vscode/.cache /home/vscode/.cargo

ENV CARGO_HOME=/home/vscode/.cargo
ENV CARGO_TARGET_DIR=/home/vscode/.cache/serein-tauri-target
ENV npm_config_cache=/home/vscode/.cache/npm
ENV SEREIN_WORKSPACE=/workspace

COPY --chmod=0755 container-entrypoint.sh /usr/local/bin/serein-container-entrypoint

# Keep normal container commands non-root. Startup uses passwordless sudo only
# to initialize named-volume permissions, then immediately drops back to the
# image's vscode account.
USER vscode
ENTRYPOINT ["sudo", "-E", "/usr/local/bin/serein-container-entrypoint"]
CMD ["bash"]
