#!/usr/bin/env bash
# Inspeção somente leitura do ambiente de build do Easyphone.
# Não instala pacotes, não usa sudo e não altera arquivos.
# Uso: ./check-toolchain.sh   (CMAKE_BIN=/caminho/cmake para testar um CMake isolado)
set -uo pipefail

ok()   { printf '[ok]       %s\n' "$*"; }
miss() { printf '[ausente]  %s\n' "$*"; }
info() { printf '[info]     %s\n' "$*"; }

info "SO: $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") | arquitetura: $(uname -m)"

for tool in gcc g++ make pkg-config git python3 node npm; do
  if command -v "$tool" >/dev/null 2>&1; then
    ok "$tool: $("$tool" --version 2>/dev/null | head -1)"
  else
    miss "$tool"
  fi
done

# CMake: o baresip 4.12 só tem caminho de build por CMake (>= 3.18)
CMAKE_BIN="${CMAKE_BIN:-$(command -v cmake 2>/dev/null || true)}"
if [ -n "$CMAKE_BIN" ] && [ -x "$CMAKE_BIN" ]; then
  v=$("$CMAKE_BIN" --version | head -1 | awk '{print $3}')
  menor=$(printf '%s\n3.18\n' "$v" | sort -V | head -1)
  if [ "$menor" = "3.18" ]; then
    ok "cmake $v em $CMAKE_BIN (>= 3.18 exigido pelo baresip)"
  else
    miss "cmake $v em $CMAKE_BIN é anterior a 3.18"
  fi
else
  miss "cmake (baresip exige >= 3.18; ver BUILD_MATRIX.md §7 para o caminho isolado)"
fi

check_header() {
  local header="$1" label="$2"
  if [ -f "/usr/include/$header" ] || [ -f "/usr/local/include/$header" ]; then
    ok "$label ($header)"
  else
    miss "$label: cabeçalho $header (necessário só para o módulo correspondente)"
  fi
}
check_header openssl/ssl.h        "OpenSSL dev (obrigatório)"
check_header alsa/asoundlib.h     "ALSA dev (módulo alsa)"
check_header pulse/pulseaudio.h   "PulseAudio dev (módulo pulse)"
check_header pipewire/pipewire.h  "PipeWire dev (módulo pipewire)"
check_header opus/opus.h          "libopus dev (módulo opus)"
check_header sndfile.h            "libsndfile dev (módulo sndfile)"
check_header portaudio.h          "PortAudio dev (módulo portaudio)"

if pkg-config --exists libre 2>/dev/null; then
  ok "libre visível ao pkg-config: $(pkg-config --modversion libre)"
else
  miss "libre (pkg-config): ver build-baresip-isolated.sh para o build em prefixo do usuário"
fi

for t in x86_64-w64-mingw32-gcc o64-clang x86_64-apple-darwin-clang; do
  if command -v "$t" >/dev/null 2>&1; then
    ok "cross-compilador $t presente (cross-build ainda não validado pelo projeto)"
  else
    miss "cross-compilador $t: cross-build indisponível neste host"
  fi
done

info "Windows (MSVC 2022+) e macOS (Xcode/clang + assinatura) exigem runner nativo; ver BUILD_MATRIX.md §4."
