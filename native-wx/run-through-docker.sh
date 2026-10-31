#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
WORKSPACE="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
exec docker run --rm -i --network=host \
  --user "$(id -u):$(id -g)" \
  -e DISPLAY="${DISPLAY:-}" \
  -e WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}" \
  -e XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-}" \
  -e GDK_BACKEND=wayland \
  -v "${XDG_RUNTIME_DIR}:${XDG_RUNTIME_DIR}" \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  -v "$WORKSPACE:/workspace" \
  -w /workspace/phone-desktop/native-wx \
  easyphone-wx-build ./build/easyphone-native
