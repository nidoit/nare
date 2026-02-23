#!/usr/bin/env bash
# build.sh — Build NARE for the current architecture
# Usage: ./build.sh [--dev | --release]
set -euo pipefail

MODE="${1:---release}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Detect host target triple ────────────────────────────────────────────────

detect_target_triple() {
    local arch kernel
    arch="$(uname -m)"
    kernel="$(uname -s)"

    case "$arch" in
        x86_64)  arch="x86_64" ;;
        aarch64) arch="aarch64" ;;
        armv7l)  arch="armv7" ;;
        i686)    arch="i686" ;;
        *)
            echo "error: unsupported architecture: $arch" >&2
            exit 1
            ;;
    esac

    case "$kernel" in
        Linux)  echo "${arch}-unknown-linux-gnu" ;;
        Darwin) echo "${arch}-apple-darwin" ;;
        *)
            echo "error: unsupported OS: $kernel" >&2
            exit 1
            ;;
    esac
}

TARGET_TRIPLE="$(detect_target_triple)"
echo "==> Detected target: $TARGET_TRIPLE"

# ── Map to pkg target ────────────────────────────────────────────────────────

pkg_target() {
    case "$1" in
        x86_64-unknown-linux-gnu)  echo "node18-linux-x64" ;;
        aarch64-unknown-linux-gnu) echo "node18-linux-arm64" ;;
        x86_64-apple-darwin)       echo "node18-macos-x64" ;;
        aarch64-apple-darwin)      echo "node18-macos-arm64" ;;
        *)
            echo "error: no pkg target mapping for $1" >&2
            exit 1
            ;;
    esac
}

PKG_TARGET="$(pkg_target "$TARGET_TRIPLE")"

# ── Check dependencies ────────────────────────────────────────────────────────

check_dep() {
    if ! command -v "$1" &>/dev/null; then
        echo "error: '$1' is required but not found" >&2
        echo "  install: $2" >&2
        exit 1
    fi
}

check_pkg() {
    if ! pkg-config --exists "$1" 2>/dev/null; then
        echo "error: system library '$1' is required but not found" >&2
        echo "  install: $2" >&2
        exit 1
    fi
}

echo "==> Checking dependencies..."
check_dep node      "sudo pacman -S nodejs"
check_dep npm       "sudo pacman -S npm"
check_dep rustc     "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
check_dep cargo     "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
check_dep pkg-config "sudo pacman -S pkgconf"
check_pkg gtk+-3.0          "sudo pacman -S gtk3"
check_pkg webkit2gtk-4.1    "sudo pacman -S webkit2gtk-4.1"
check_pkg gdk-3.0           "sudo pacman -S gtk3"

# ── Install npm dependencies ─────────────────────────────────────────────────

echo "==> Installing frontend dependencies..."
npm install

echo "==> Installing bridge dependencies..."
(cd bridge && npm install)

# ── Build bridge sidecar ─────────────────────────────────────────────────────

SIDECAR_NAME="nare-bridge-${TARGET_TRIPLE}"
SIDECAR_PATH="src-tauri/binaries/${SIDECAR_NAME}"

echo "==> Building bridge sidecar → $SIDECAR_NAME"
mkdir -p src-tauri/binaries

npx --prefix bridge pkg bridge/index.js \
    --targets "$PKG_TARGET" \
    --output "$SIDECAR_PATH"

chmod +x "$SIDECAR_PATH"
echo "    sidecar ready: $SIDECAR_PATH"

# ── Build Tauri app ──────────────────────────────────────────────────────────

if [ "$MODE" = "--dev" ]; then
    echo "==> Starting Tauri dev server..."
    npx tauri dev
else
    echo "==> Building Tauri app (release)..."
    npx tauri build

    # Show output location
    BUNDLE_DIR="src-tauri/target/release/bundle"
    echo ""
    echo "==> Build complete! Bundles:"
    if [ -d "$BUNDLE_DIR" ]; then
        find "$BUNDLE_DIR" -maxdepth 2 -type f \( -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" \) 2>/dev/null | while read -r f; do
            echo "    $(basename "$f")  →  $f"
        done
    fi
    echo ""
    echo "    Binary: src-tauri/target/release/nare"
    echo "    Run with: ./nare.run"
fi
