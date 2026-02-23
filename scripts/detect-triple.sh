#!/usr/bin/env bash
# Detect the Rust-style host target triple
set -euo pipefail

arch="$(uname -m)"
kernel="$(uname -s)"

case "$arch" in
    x86_64)  arch="x86_64" ;;
    aarch64) arch="aarch64" ;;
    armv7l)  arch="armv7" ;;
    i686)    arch="i686" ;;
    *)       echo "error: unsupported arch: $arch" >&2; exit 1 ;;
esac

case "$kernel" in
    Linux)  echo "${arch}-unknown-linux-gnu" ;;
    Darwin) echo "${arch}-apple-darwin" ;;
    *)      echo "error: unsupported OS: $kernel" >&2; exit 1 ;;
esac
