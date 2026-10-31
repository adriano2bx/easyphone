#!/bin/sh
# Abre a janela demo do renderer. Não há motor SIP, conta, contato nem chamada reais aqui.
# Uso: sh renderer/run-demo.sh [--fixture=registered|incoming|active-muted|active-unmuted|auth-failed]  (fixtures só para QA visual; ver ui/qa-fixtures.js)
set -eu
APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/demo" && pwd)"
RUNTIME_HOME="${EASYPHONE_ELECTRON_HOME:-}"
if [ -z "$RUNTIME_HOME" ]; then
  printf '%s\n' 'Defina EASYPHONE_ELECTRON_HOME para o diretório do runtime de desenvolvimento.' >&2
  exit 1
fi
ELECTRON_CLI="$RUNTIME_HOME/runtime/node_modules/electron/cli.js"
NODE_BIN="$RUNTIME_HOME/node-runtime/node_modules/node/bin/node"
if [ ! -f "$ELECTRON_CLI" ] || [ ! -x "$NODE_BIN" ]; then
  printf '%s\n' 'Runtime do Electron não encontrado em '"$RUNTIME_HOME"'.' >&2
  exit 1
fi
exec "$NODE_BIN" "$ELECTRON_CLI" "$APP_DIR" --disable-vulkan "$@"
