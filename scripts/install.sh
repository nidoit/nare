#!/usr/bin/env bash
# install.sh — Install NARE from the self-extracting .run archive
# This script is executed by makeself after extraction.
set -euo pipefail

PREFIX="${NARE_PREFIX:-/usr/local}"
BIN_DIR="$PREFIX/bin"
SHARE_DIR="$PREFIX/share"
APP_DIR="$SHARE_DIR/nare"
ICON_DIR="$SHARE_DIR/icons/hicolor"
DESKTOP_DIR="$SHARE_DIR/applications"

# ── Helpers ──────────────────────────────────────────────────────────────────

info()  { echo "  [+] $*"; }
warn()  { echo "  [!] $*" >&2; }
die()   { echo "  [ERROR] $*" >&2; exit 1; }

need_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo ""
        echo "NARE installer requires root privileges for system-wide install."
        echo "Re-run with:  sudo ./nare.run"
        echo ""
        echo "Or set a user-local prefix:"
        echo "  NARE_PREFIX=~/.local ./nare.run"
        exit 1
    fi
}

# ── Parse arguments ──────────────────────────────────────────────────────────

UNINSTALL=false
for arg in "$@"; do
    case "$arg" in
        --uninstall) UNINSTALL=true ;;
        --prefix=*)  PREFIX="${arg#--prefix=}" ;;
        --help|-h)
            echo "NARE Installer"
            echo ""
            echo "Usage: ./nare.run [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --prefix=PATH   Install to PATH instead of /usr/local"
            echo "  --uninstall     Remove NARE from the system"
            echo "  -h, --help      Show this help"
            echo ""
            echo "Environment:"
            echo "  NARE_PREFIX     Same as --prefix"
            exit 0
            ;;
    esac
done

# Recalculate dirs after prefix override
BIN_DIR="$PREFIX/bin"
SHARE_DIR="$PREFIX/share"
APP_DIR="$SHARE_DIR/nare"
ICON_DIR="$SHARE_DIR/icons/hicolor"
DESKTOP_DIR="$SHARE_DIR/applications"

# ── Uninstall ────────────────────────────────────────────────────────────────

if [ "$UNINSTALL" = true ]; then
    echo "==> Uninstalling NARE from $PREFIX..."
    [ "$PREFIX" = "/usr/local" ] || [ "$PREFIX" = "/usr" ] && need_root

    rm -f  "$BIN_DIR/nare"
    rm -rf "$APP_DIR"
    rm -f  "$DESKTOP_DIR/nare.desktop"
    rm -f  "$ICON_DIR/512x512/apps/nare.png"
    rm -f  "$ICON_DIR/32x32/apps/nare.png"

    # Update icon cache if available
    if command -v gtk-update-icon-cache &>/dev/null; then
        gtk-update-icon-cache -f -t "$ICON_DIR" 2>/dev/null || true
    fi

    info "NARE has been removed."
    exit 0
fi

# ── Check runtime dependencies ───────────────────────────────────────────────

echo "==> Checking runtime dependencies..."

missing=()

if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null && \
   ! pkg-config --exists webkit2gtk-4.0 2>/dev/null; then
    missing+=("webkit2gtk-4.1")
fi

if ! pkg-config --exists gtk+-3.0 2>/dev/null; then
    missing+=("gtk3")
fi

if [ ${#missing[@]} -gt 0 ]; then
    warn "Missing runtime dependencies: ${missing[*]}"
    echo ""
    echo "  On Arch Linux:  sudo pacman -S ${missing[*]}"
    echo "  On Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0"
    echo ""
    echo "Install them and re-run this installer."
    exit 1
fi

info "All runtime dependencies found."

# ── Install ──────────────────────────────────────────────────────────────────

[ "$PREFIX" = "/usr/local" ] || [ "$PREFIX" = "/usr" ] && need_root

echo "==> Installing NARE to $PREFIX..."

# Binary
install -Dm755 nare "$BIN_DIR/nare"
info "Binary  → $BIN_DIR/nare"

# Sidecar (WhatsApp bridge) — optional, may not be included
if [ -f nare-bridge ]; then
    mkdir -p "$APP_DIR"
    install -Dm755 nare-bridge "$APP_DIR/nare-bridge"
    info "Sidecar → $APP_DIR/nare-bridge"
fi

# Icons
if [ -f icon.png ]; then
    install -Dm644 icon.png "$ICON_DIR/512x512/apps/nare.png"
    info "Icon    → $ICON_DIR/512x512/apps/nare.png"
fi

if [ -f 32x32.png ]; then
    install -Dm644 32x32.png "$ICON_DIR/32x32/apps/nare.png"
    info "Icon    → $ICON_DIR/32x32/apps/nare.png"
fi

# Desktop entry
install -Dm644 nare.desktop "$DESKTOP_DIR/nare.desktop"
info "Desktop → $DESKTOP_DIR/nare.desktop"

# Update icon cache
if command -v gtk-update-icon-cache &>/dev/null; then
    gtk-update-icon-cache -f -t "$ICON_DIR" 2>/dev/null || true
fi

# Update desktop database
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "==> NARE v0.1.0 installed successfully!"
echo ""
echo "    Run:        nare"
echo "    Uninstall:  sudo ./nare.run -- --uninstall"
echo ""
