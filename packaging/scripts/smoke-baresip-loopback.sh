#!/usr/bin/env bash
# Smoke test do baresip isolado: inicia o binário com configuração temporária,
# sem contas SIP, sem chamadas e sem ctrl_tcp; encerra por timeout e lista sockets
# em escuta do próprio processo. Não registra conta nem origina chamada.
# Uso: ./smoke-baresip-loopback.sh   (SMOKE_SECONDS=6 por padrão)
set -euo pipefail

WORK="${EASYPHONE_BUILD_HOME:-$HOME/.cache/easyphone-build}"
PREFIX="$WORK/prefix"
BIN="$PREFIX/bin/baresip"
SECONDS_RUN="${SMOKE_SECONDS:-6}"

if [ ! -x "$BIN" ]; then
  echo "baresip não encontrado em $BIN; rode build-baresip-isolated.sh primeiro" >&2
  exit 2
fi
command -v ss >/dev/null 2>&1 || { echo "ss (iproute2) é necessário para listar sockets" >&2; exit 2; }

CFG_DIR="$(mktemp -d "$WORK/smoke.XXXXXX")"
trap 'rm -rf "$CFG_DIR"' EXIT

# 1) Primeira execução gera o template de configuração e sai pelo timeout.
LD_LIBRARY_PATH="$PREFIX/lib" "$BIN" -f "$CFG_DIR" -t 1 >"$CFG_DIR/first-run.log" 2>&1 || true

# 2) Ajustes de segurança: escuta SIP só em loopback; ctrl_tcp permanece comentado.
sed -i -E 's|^#?sip_listen.*|sip_listen\t\t127.0.0.1:0|' "$CFG_DIR/config"
sed -i -E 's|^module_app\s+ctrl_tcp.so|#module_app\t\tctrl_tcp.so|' "$CFG_DIR/config"
if grep -qE '^module_app\s+ctrl_tcp' "$CFG_DIR/config"; then
  echo "ctrl_tcp ainda ativo na configuração temporária; abortando" >&2
  exit 1
fi

# 3) Execução de teste.
LD_LIBRARY_PATH="$PREFIX/lib" "$BIN" -f "$CFG_DIR" -t "$SECONDS_RUN" >"$CFG_DIR/run.log" 2>&1 &
PID=$!
sleep 3

listeners="$(ss -H -ltnup 2>/dev/null | grep "pid=$PID," || true)"
total=$(printf '%s' "$listeners" | grep -c . || true)
fora=$(printf '%s\n' "$listeners" | awk 'NF && $5 !~ /^127\.|^\[::1\]/' | grep -c . || true)

echo "sockets em escuta do baresip (pid $PID): total=$total, fora de loopback=$fora"
printf '%s\n' "$listeners" | awk 'NF {print "  " $1, $5}' | head -20

rc=0
wait "$PID" || rc=$?
echo "baresip encerrou com código $rc"
if grep -q 'ctrl_tcp' "$CFG_DIR/run.log"; then
  echo "AVISO: ctrl_tcp citado no log de execução"
fi
if [ "$fora" -gt 0 ]; then
  echo "AVISO: $fora socket(s) fora de loopback — ver BUILD_MATRIX.md §4.4 (decisão pendente)"
fi
exit "$rc"
