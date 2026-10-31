const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

// Tamanhos lógicos. O Zoiper não foi medido (ADR 0003): a janela é redimensionável com limite mínimo.
const MODES = {
  normal: { width: 380, height: 680, minWidth: 340, minHeight: 560 },
  compact: { width: 380, height: 184, minWidth: 340, minHeight: 160 },
};

let win;
let mode = 'normal';
let normalSize = { width: MODES.normal.width, height: MODES.normal.height };

function applyMode(next) {
  if (!win || !MODES[next] || next === mode) return;
  if (mode === 'normal') normalSize = win.getContentSize();
  const target = MODES[next];
  mode = next;
  win.setMinimumSize(target.minWidth, target.minHeight);
  const size = next === 'normal' ? normalSize : { width: target.width, height: target.height };
  win.setContentSize(size.width, size.height);
}

function createWindow() {
  win = new BrowserWindow({
    width: MODES.normal.width,
    height: MODES.normal.height,
    minWidth: MODES.normal.minWidth,
    minHeight: MODES.normal.minHeight,
    title: 'Easyphone',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const fixture = process.argv.find((arg) => arg.startsWith('--fixture='))?.slice('--fixture='.length);
  win.loadFile(path.join(__dirname, '..', 'index.html'), fixture ? { query: { fixture } } : {});
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = undefined; });
}

ipcMain.handle('phone-shell:set-mode', (_event, next) => applyMode(next));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
