#!/usr/bin/env bash
# Build isolado de libre e baresip (Linux) num diretório de trabalho do usuário.
# - Não usa sudo, não instala pacotes do sistema e não toca nas árvores do projeto.
# - CMake é baixado de release oficial do Kitware e verificado por SHA-256 antes do uso.
# - Fontes são clonadas nos commits fixados abaixo e conferidos após o checkout.
# Diretório de trabalho: $EASYPHONE_BUILD_HOME (padrão: ~/.cache/easyphone-build).
set -euo pipefail

# Versões fixadas — ver BUILD_MATRIX.md §2 e §7
CMAKE_VERSION=3.31.6
CMAKE_SHA256=5a1133ff103c71eb5120e2cc3de922733e7d8a26a98ae716397e8676adb367bf
RE_COMMIT=e5ec9ba78e58bc251d1e3989c892002693b03c63      # baresip/re, 4.12.0
BARESIP_COMMIT=cf7f60ada90a9b1fb58d004e56f6247cb21f6e0f # baresip/baresip, 4.12.0

# Módulos testados neste Linux (sem alsa/pulse/opus: faltam cabeçalhos -dev; o CMake ignora módulos sem dependência).
# ctrl_tcp é compilado para teste; NÃO habilitar no produto sem decisão do ADR 0003.
DEFAULT_MODULES="account;cons;ctrl_tcp;ausine;aufile;g711;stun;turn;ice;srtp;dtls_srtp;menu;auconv;auresamp;augain;vumeter;in_band_dtmf;mwi;presence;contact;serreg;uuid;stdio;syslog;debug_cmd"
MODULES="${EASYPHONE_MODULES:-$DEFAULT_MODULES}"

WORK="${EASYPHONE_BUILD_HOME:-$HOME/.cache/easyphone-build}"
SRC="$WORK/src"; TOOLS="$WORK/tools"; PREFIX="$WORK/prefix"; LOGS="$WORK/logs"
CMAKE_DIR="$TOOLS/cmake-$CMAKE_VERSION-linux-x86_64"
CMAKE_BIN="$CMAKE_DIR/bin/cmake"
JOBS="${JOBS:-$(nproc)}"

mkdir -p "$SRC" "$TOOLS" "$PREFIX" "$LOGS"

log() { printf '\n== %s\n' "$*"; }

ensure_cmake() {
  if [ -x "$CMAKE_BIN" ]; then
    log "CMake já presente: $("$CMAKE_BIN" --version | head -1)"
    return
  fi
  local tarball="$TOOLS/cmake-$CMAKE_VERSION-linux-x86_64.tar.gz"
  log "Baixando CMake $CMAKE_VERSION (release oficial Kitware)"
  curl -fsSL -o "$tarball" \
    "https://github.com/Kitware/CMake/releases/download/v$CMAKE_VERSION/cmake-$CMAKE_VERSION-linux-x86_64.tar.gz"
  echo "$CMAKE_SHA256  $tarball" | sha256sum -c -
  tar -xzf "$tarball" -C "$TOOLS"
  "$CMAKE_BIN" --version | head -1
}

fetch_pinned() { # url commit destino
  local url="$1" commit="$2" dir="$3"
  if [ ! -d "$dir/.git" ]; then
    git init -q "$dir"
    git -C "$dir" remote add origin "$url"
  fi
  git -C "$dir" fetch -q --depth 1 origin "$commit"
  git -C "$dir" checkout -q --detach FETCH_HEAD
  if [ "$(git -C "$dir" rev-parse HEAD)" != "$commit" ]; then
    echo "commit inesperado em $dir" >&2
    exit 1
  fi
}

cmake_build() { # origem, nome, extra...
  local src="$1" name="$2"; shift 2
  local bdir="$src/build"
  log "Configurando $name"
  "$CMAKE_BIN" -S "$src" -B "$bdir" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="$PREFIX" \
    -DCMAKE_PREFIX_PATH="$PREFIX" "$@" >"$LOGS/$name-config.log" 2>&1
  log "Compilando $name (log: $LOGS/$name-build.log)"
  "$CMAKE_BIN" --build "$bdir" -j"$JOBS" >"$LOGS/$name-build.log" 2>&1
  log "Instalando $name em $PREFIX"
  "$CMAKE_BIN" --install "$bdir" >"$LOGS/$name-install.log" 2>&1
}

ensure_cmake

log "Obtendo fontes fixadas"
fetch_pinned https://github.com/baresip/re.git "$RE_COMMIT" "$SRC/re"
fetch_pinned https://github.com/baresip/baresip.git "$BARESIP_COMMIT" "$SRC/baresip"

cmake_build "$SRC/re" libre -DLIBRE_BUILD_SHARED=ON
cmake_build "$SRC/baresip" baresip -DMODULES="$MODULES"

log "Concluído"
echo "binário: $PREFIX/bin/baresip"
grep -E 'MODULES_DETECTED|Could NOT find' "$LOGS/baresip-config.log" || true
echo "Próximo passo: $(dirname "$0")/smoke-baresip-loopback.sh"
