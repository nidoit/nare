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

# ── Prepare bridge (no sidecar — node runs bridge/index.js directly) ─────────

echo "==> Bridge dependencies ready (will be bundled as source)"

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

VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
echo "==> Packaging nare.run (v${VERSION})..."

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

# Binary (stripped)
cp "$BINARY" "$STAGE_DIR/nare"
strip "$STAGE_DIR/nare" 2>/dev/null || true
echo "    nare ($(du -h "$STAGE_DIR/nare" | cut -f1))"

# Bridge source + dependencies (node runs these directly)
mkdir -p "$STAGE_DIR/bridge"
cp bridge/index.js bridge/package.json "$STAGE_DIR/bridge/"
if [ -d bridge/node_modules ]; then
    cp -r bridge/node_modules "$STAGE_DIR/bridge/node_modules"
    echo "    bridge/ ($(du -sh "$STAGE_DIR/bridge" | cut -f1))"
else
    echo "    bridge/ (deps will be installed on first run)"
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

# Create .run — use makeself if available, otherwise build a simple self-extracting archive
if command -v makeself &>/dev/null; then
    makeself --gzip --notemp \
        "$STAGE_DIR" \
        nare.run \
        "NARE v${VERSION} — Notification & Automated Reporting Engine" \
        ./install.sh
else
    echo "    (makeself not found, using built-in self-extracting archive)"
    # Create tar payload
    PAYLOAD="$(mktemp)"
    tar czf "$PAYLOAD" -C "$STAGE_DIR" .

    # Write self-extracting header + payload
    cat > nare.run <<'SFXHEADER'
#!/usr/bin/env bash
# NARE self-extracting installer
set -euo pipefail
TMPDIR="$(mktemp -d)"
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT
ARCHIVE_LINE=$(awk '/^__ARCHIVE__$/{print NR + 1; exit 0}' "$0")
tail -n+"$ARCHIVE_LINE" "$0" | tar xz -C "$TMPDIR"
cd "$TMPDIR"
bash ./install.sh "$@"
exit 0
__ARCHIVE__
SFXHEADER
    cat "$PAYLOAD" >> nare.run
    rm -f "$PAYLOAD"
fi

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
