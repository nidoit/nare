#!/usr/bin/env bash
# build.sh — Build NARE and package into nare.run
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
    exit 0
fi

echo "==> Building Tauri app (release)..."
npx tauri build

BINARY="src-tauri/target/release/nare"

# ── Package into nare.run ────────────────────────────────────────────────────

check_dep makeself "sudo pacman -S makeself"

VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
echo "==> Packaging nare.run (v${VERSION})..."

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

# Binary (stripped)
cp "$BINARY" "$STAGE_DIR/nare"
strip "$STAGE_DIR/nare" 2>/dev/null || true
echo "    nare ($(du -h "$STAGE_DIR/nare" | cut -f1))"

# Sidecar
if [ -x "$SIDECAR_PATH" ]; then
    cp "$SIDECAR_PATH" "$STAGE_DIR/nare-bridge"
    echo "    nare-bridge ($(du -h "$STAGE_DIR/nare-bridge" | cut -f1))"
fi

# Icons
for icon in icon.png 32x32.png; do
    if [ -f "src-tauri/icons/$icon" ]; then
        cp "src-tauri/icons/$icon" "$STAGE_DIR/$icon"
        echo "    $icon"
    fi
done

# Desktop entry
cat > "$STAGE_DIR/nare.desktop" <<'DESKTOP'
[Desktop Entry]
Name=NARE
Comment=Notification & Automated Reporting Engine
Exec=nare
Icon=nare
Terminal=false
Type=Application
Categories=System;Utility;
Keywords=linux;assistant;ai;whatsapp;notification;
StartupWMClass=nare
DESKTOP
echo "    nare.desktop"

# Install script
cp scripts/install.sh "$STAGE_DIR/install.sh"
chmod +x "$STAGE_DIR/install.sh"
echo "    install.sh"

# Create .run
makeself --gzip --notemp \
    "$STAGE_DIR" \
    nare.run \
    "NARE v${VERSION} — Notification & Automated Reporting Engine" \
    ./install.sh

chmod +x nare.run

echo ""
echo "==> Build complete!"
echo ""
echo "    nare.run  ($(du -h nare.run | cut -f1))"
echo ""
echo "    Install:    sudo ./nare.run"
echo "    User-local: NARE_PREFIX=~/.local ./nare.run"
echo "    Uninstall:  sudo ./nare.run -- --uninstall"
echo ""
