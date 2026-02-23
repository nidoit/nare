#!/usr/bin/env bash
# Map a Rust target triple to a pkg target string
set -euo pipefail

case "${1:?usage: pkg-target.sh <triple>}" in
    x86_64-unknown-linux-gnu)  echo "node18-linux-x64" ;;
    aarch64-unknown-linux-gnu) echo "node18-linux-arm64" ;;
    x86_64-apple-darwin)       echo "node18-macos-x64" ;;
    aarch64-apple-darwin)      echo "node18-macos-arm64" ;;
    *) echo "error: no pkg target for $1" >&2; exit 1 ;;
esac
