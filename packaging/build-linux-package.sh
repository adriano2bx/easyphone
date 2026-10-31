#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
BUILD_HOME="${EASYPHONE_BUILD_HOME:-$HOME/.cache/easyphone-build}"
ELECTRON_DIST="${EASYPHONE_ELECTRON_DIST:-}"
PREFIX="$BUILD_HOME/prefix"
OUT="$ROOT/dist"
STAGE="$BUILD_HOME/package-stage-$VERSION"
APP="$STAGE/easyphone"
[ -n "$ELECTRON_DIST" ] && [ -x "$ELECTRON_DIST/electron" ] || { echo "Defina EASYPHONE_ELECTRON_DIST para o diretório do runtime Electron." >&2; exit 1; }
[ -x "$PREFIX/bin/baresip" ] || { echo "Baresip não compilado em $PREFIX" >&2; exit 1; }
[ -f "$PREFIX/lib/baresip/modules/pulse.so" ] || { echo "Módulo PulseAudio ausente; compile o Baresip com EASYPHONE_MODULES incluindo pulse" >&2; exit 1; }
NATIVE_BUILD="${EASYPHONE_NATIVE_BUILD:-$ROOT/native-wx/build}"
[ -x "$NATIVE_BUILD/easyphone-native" ] || { echo "UI nativa não compilada em $NATIVE_BUILD; compile phone-desktop/native-wx antes de empacotar" >&2; exit 1; }
[ -d "$NATIVE_BUILD/runtime-lib" ] || { echo "Bibliotecas wxWidgets ausentes em $NATIVE_BUILD/runtime-lib" >&2; exit 1; }
mkdir -p "$OUT"
if [ -e "$APP" ]; then echo "Staging já existe: $APP (preservado; mova-o manualmente para refazer)" >&2; exit 1; fi
mkdir -p "$APP/electron/resources/app/packaging/baresip/bin" "$APP/electron/resources/app/packaging/baresip/lib" "$APP/electron/resources/app/packaging/baresip/modules"
mkdir -p "$APP/electron/resources/app/packaging/native-wx/bin/assets" "$APP/electron/resources/app/packaging/native-wx/lib"
cp -a "$ELECTRON_DIST" "$APP/electron"
chmod 755 "$APP/electron/electron" "$APP/electron/chrome-sandbox" 2>/dev/null || true
chmod -R u+rwX,go+rX "$APP/electron"
mkdir -p "$APP/electron/resources/app"
cp -a "$ROOT/electron" "$ROOT/engine" "$ROOT/renderer" "$ROOT/ui" "$ROOT/contracts" "$ROOT/package.json" "$APP/electron/resources/app/"
# A distribuição usa a bridge IPC real; fixtures de QA não fazem parte do produto.
sed -i '/qa-fixtures\.js/d; /bridge-offline\.js/d; /qa-banner/d' "$APP/electron/resources/app/renderer/index.html"
cp "$PREFIX/bin/baresip" "$APP/electron/resources/app/packaging/baresip/bin/baresip-real"
cp -a "$PREFIX/lib/libre.so"* "$PREFIX/lib/libbaresip.so"* "$APP/electron/resources/app/packaging/baresip/lib/"
cp -a "$PREFIX/lib/baresip/modules/." "$APP/electron/resources/app/packaging/baresip/modules/"
cp "$NATIVE_BUILD/easyphone-native" "$APP/electron/resources/app/packaging/native-wx/bin/easyphone-native-real"
cp -a "$NATIVE_BUILD/assets/." "$APP/electron/resources/app/packaging/native-wx/bin/assets/"
cp -a "$NATIVE_BUILD/runtime-lib/." "$APP/electron/resources/app/packaging/native-wx/lib/"
cat > "$APP/electron/resources/app/packaging/native-wx/bin/easyphone-native" <<'WRAPPER'
#!/bin/sh
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export LD_LIBRARY_PATH="$ROOT/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$ROOT/bin/easyphone-native-real" "$@"
WRAPPER
chmod 755 "$APP/electron/resources/app/packaging/native-wx/bin/easyphone-native" "$APP/electron/resources/app/packaging/native-wx/bin/easyphone-native-real"
cat > "$APP/electron/resources/app/packaging/baresip/bin/baresip" <<'WRAPPER'
#!/bin/sh
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export LD_LIBRARY_PATH="$ROOT/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$ROOT/bin/baresip-real" "$@"
WRAPPER
chmod 755 "$APP/electron/resources/app/packaging/baresip/bin/baresip" "$APP/electron/resources/app/packaging/baresip/bin/baresip-real"
install -m 644 "$PREFIX/../src/baresip/LICENSE" "$APP/BARESIP-LICENSE"
install -m 644 "$PREFIX/../src/re/LICENSE" "$APP/LIBRE-LICENSE"
[ -f "$ELECTRON_DIST/LICENSE" ] && cp "$ELECTRON_DIST/LICENSE" "$APP/ELECTRON-LICENSE"
[ -f "$ELECTRON_DIST/LICENSES.chromium.html" ] && cp "$ELECTRON_DIST/LICENSES.chromium.html" "$APP/CHROMIUM-LICENSES.html"
cp "$ROOT/ui/assets/easyphone-logo-negative.png" "$APP/easyphone-logo-negative.png"
cp "$ROOT/ui/assets/easyphone-icon.png" "$APP/easyphone-icon.png"
mkdir -p "$APP/share/applications" "$APP/share/icons/hicolor/256x256/apps" "$APP/bin"
cp "$ROOT/ui/assets/easyphone-icon.png" "$APP/share/icons/hicolor/256x256/apps/easyphone.png"
cp -a "$ROOT/branding/easyphone/Linux/hicolor/." "$APP/share/icons/hicolor/"
cat > "$APP/bin/easyphone" <<'LAUNCHER'
#!/bin/sh
SELF="$(readlink -f -- "$0")"
HERE="$(CDPATH= cd -- "$(dirname -- "$SELF")/.." && pwd)"
export EASYPHONE_NATIVE_UI=1
exec "$HERE/electron/electron" "$HERE/electron/resources/app" "$@"
LAUNCHER
chmod 755 "$APP/bin/easyphone"
cat > "$APP/share/applications/easyphone.desktop" <<'DESKTOP'
[Desktop Entry]
Name=easyphone
Comment=easyphone — chamadas SIP
Exec=easyphone
Icon=easyphone
Terminal=false
Type=Application
Categories=Network;Telephony;
DESKTOP
cat > "$APP/INSTALL-LOCAL.sh" <<'INSTALLER'
#!/bin/sh
set -eu
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
DEST="${HOME}/.local/opt/easyphone"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APPS="$DATA_HOME/applications"
ICON_DIR="$DATA_HOME/icons/hicolor/256x256/apps"
mkdir -p "${HOME}/.local/opt" "${HOME}/.local/bin" "$APPS" "$ICON_DIR"
if [ -e "$DEST" ]; then cp -a "$HERE/." "$DEST/"; else cp -a "$HERE" "$DEST"; fi
ln -sfn "$DEST/bin/easyphone" "${HOME}/.local/bin/easyphone"
sed "s|^Exec=.*|Exec=${HOME}/.local/bin/easyphone|; s|^Icon=.*|Icon=easyphone|" "$DEST/share/applications/easyphone.desktop" > "$APPS/easyphone.desktop"
cp "$DEST/easyphone-icon.png" "$ICON_DIR/easyphone.png"
chmod 755 "$APPS/easyphone.desktop"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || printf '%s/Desktop' "$HOME")"
mkdir -p "$DESKTOP_DIR"
cp "$APPS/easyphone.desktop" "$DESKTOP_DIR/easyphone.desktop"
chmod 755 "$DESKTOP_DIR/easyphone.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" || true
echo "easyphone instalado. Abra pelo menu ou execute: ${HOME}/.local/bin/easyphone"
echo "Para fixar no painel KDE: abra o easyphone, clique com o botão direito no ícone do painel e escolha Fixar no Gerenciador de Tarefas."
INSTALLER
chmod 755 "$APP/INSTALL-LOCAL.sh"
cat > "$APP/UNINSTALL-LOCAL.sh" <<'UNINSTALLER'
#!/bin/sh
set -eu
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
rm -rf "$HOME/.local/opt/easyphone"
rm -f "$HOME/.local/bin/easyphone" "$DATA_HOME/applications/easyphone.desktop" "$DATA_HOME/icons/hicolor/256x256/apps/easyphone.png"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || printf '%s/Desktop' "$HOME")"
rm -f "$DESKTOP_DIR/easyphone.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA_HOME/applications" || true
printf '%s\n' 'easyphone removido. As contas e preferências em ~/.config/Easyphone foram preservadas.'
UNINSTALLER
chmod 755 "$APP/UNINSTALL-LOCAL.sh"
# Portátil: runtime dentro do diretório, sem instalação privilegiada.
tar -C "$STAGE" -czf "$OUT/easyphone-linux-x86_64-v$VERSION.tar.gz" easyphone
# Pacote Debian instalável por usuário root, se o cliente preferir dpkg.
DEBROOT="$BUILD_HOME/deb-root-$VERSION"
mkdir -p "$DEBROOT/opt" "$DEBROOT/usr/bin" "$DEBROOT/usr/share/applications" "$DEBROOT/usr/share/icons/hicolor/256x256/apps" "$DEBROOT/DEBIAN"
cp -a "$APP" "$DEBROOT/opt/easyphone"
ln -s /opt/easyphone/bin/easyphone "$DEBROOT/usr/bin/easyphone"
sed 's|^Exec=.*|Exec=/usr/bin/easyphone|' "$APP/share/applications/easyphone.desktop" > "$DEBROOT/usr/share/applications/easyphone.desktop"
cp "$APP/easyphone-icon.png" "$DEBROOT/usr/share/icons/hicolor/256x256/apps/easyphone.png"
cat > "$DEBROOT/DEBIAN/control" <<CONTROL
Package: easyphone
Version: $VERSION
Section: comm
Priority: optional
Architecture: amd64
Maintainer: easyphone
Description: easyphone - SIP softphone
CONTROL
dpkg-deb --build "$DEBROOT" "$OUT/easyphone_${VERSION}_amd64.deb" >/dev/null
printf 'Pacotes gerados em %s\n' "$OUT"
