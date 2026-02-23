#!/usr/bin/env bash
# package-run.sh — Package NARE into a self-extracting .run installer
# Usage: ./scripts/package-run.sh [--skip-build]
#
# Prerequisites:
#   - makeself (sudo pacman -S makeself / sudo apt install makeself)
#   - Release binary already built (or omit --skip-build to build it)
#
# Output: nare.run in the project root
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

SKIP_BUILD=false
for arg in "$@"; do
    case "$arg" in
        --skip-build) SKIP_BUILD=true ;;
        -h|--help)
            echo "Usage: $0 [--skip-build]"
            echo ""
            echo "Packages NARE into a self-extracting .run installer."
            echo ""
            echo "Options:"
            echo "  --skip-build    Skip building; use existing release binary"
            echo "  -h, --help      Show this help"
            exit 0
            ;;
    esac
done

# ── Check tools ──────────────────────────────────────────────────────────────

if ! command -v makeself &>/dev/null; then
    echo "error: 'makeself' is required but not found" >&2
    echo "  Arch: sudo pacman -S makeself" >&2
    echo "  Ubuntu: sudo apt install makeself" >&2
    exit 1
fi

# ── Detect target triple ────────────────────────────────────────────────────

TARGET_TRIPLE="$(bash scripts/detect-triple.sh)"
echo "==> Target: $TARGET_TRIPLE"

# ── Build (unless skipped) ───────────────────────────────────────────────────

BINARY="src-tauri/target/release/nare"
SIDECAR="src-tauri/binaries/nare-bridge-${TARGET_TRIPLE}"

if [ "$SKIP_BUILD" = false ]; then
    echo "==> Building NARE (release)..."
    bash build.sh --release
fi

if [ ! -x "$BINARY" ]; then
    echo "error: release binary not found at $BINARY" >&2
    echo "  Run: ./build.sh --release" >&2
    exit 1
fi

# ── Read version from tauri.conf.json ────────────────────────────────────────

VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
echo "==> Packaging NARE v${VERSION}"

# ── Stage files ──────────────────────────────────────────────────────────────

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "==> Staging files..."

# Binary (stripped for smaller size)
cp "$BINARY" "$STAGE_DIR/nare"
strip "$STAGE_DIR/nare" 2>/dev/null || true
echo "    nare ($(du -h "$STAGE_DIR/nare" | cut -f1))"

# Sidecar (optional — only if it was built)
if [ -x "$SIDECAR" ]; then
    cp "$SIDECAR" "$STAGE_DIR/nare-bridge"
    echo "    nare-bridge ($(du -h "$STAGE_DIR/nare-bridge" | cut -f1))"
else
    echo "    nare-bridge (skipped — not built)"
fi

# Icons
if [ -f src-tauri/icons/icon.png ]; then
    cp src-tauri/icons/icon.png "$STAGE_DIR/icon.png"
    echo "    icon.png"
fi

if [ -f src-tauri/icons/32x32.png ]; then
    cp src-tauri/icons/32x32.png "$STAGE_DIR/32x32.png"
    echo "    32x32.png"
fi

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

# ── Create .run ──────────────────────────────────────────────────────────────

OUTPUT="nare.run"

echo "==> Creating $OUTPUT..."

makeself \
    --gzip \
    --notemp \
    "$STAGE_DIR" \
    "$OUTPUT" \
    "NARE v${VERSION} — Notification & Automated Reporting Engine" \
    ./install.sh

chmod +x "$OUTPUT"

echo ""
echo "==> Done! Created: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo ""
echo "    Install:    sudo ./$OUTPUT"
echo "    User-local: NARE_PREFIX=~/.local ./$OUTPUT"
echo "    Uninstall:  sudo ./$OUTPUT -- --uninstall"
echo "    Help:       ./$OUTPUT -- --help"
echo ""
