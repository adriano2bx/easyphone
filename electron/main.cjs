'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, Tray } = require('electron');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createPhoneEngine, PhoneError, validateAccountDraft, pickLocalAddress } = require('../engine/index.cjs');
const { validateDestination } = require('../engine/validation.cjs');
const { createBrandingStore } = require('./branding.cjs');

app.setName('Easyphone');
// Mantém o cofre criptografado existente durante a troca de identidade visual.
app.setPath('userData', path.join(app.getPath('appData'), 'Easyphone'));

// Contas e senhas ficam cifradas pelo cofre do sistema. O renderer recebe só snapshots sem segredos.
const VAULT_VERSION = 1;
const CA_FILE_CANDIDATES = ['/etc/ssl/certs/ca-certificates.crt'];
let engine;
let mainWindow = null;
let tray = null;
let nativeFrontend = null;
let shuttingDown = false;
let isQuitting = false;
let callHistory = [];
let lastHistoryCallId = null;
const nativeUiMode = process.env.EASYPHONE_NATIVE_UI === '1';
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.exit(0);
} else {
  app.on('second-instance', () => showMainWindow());
}

function vaultPath() {
  return path.join(app.getPath('userData'), 'secure', 'phone-accounts.dat');
}

function assertVaultAvailable() {
  if (!safeStorage.isEncryptionAvailable()) throw new PhoneError('VAULT_UNAVAILABLE', 'O cofre do sistema não está disponível para proteger as senhas.');
  if (typeof safeStorage.getSelectedStorageBackend === 'function' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new PhoneError('VAULT_UNAVAILABLE', 'O cofre do sistema não está disponível para proteger as senhas.');
  }
}

function readVault() {
  if (!fs.existsSync(vaultPath())) return [];
  assertVaultAvailable();
  let payload;
  try {
    // Mensagem de JSON inválido pode citar trechos do texto decifrado (senhas): não propagar o erro original.
    payload = JSON.parse(safeStorage.decryptString(fs.readFileSync(vaultPath())));
  } catch {
    throw new PhoneError('VAULT_CORRUPT', 'Cofre de contas ilegível.');
  }
  return Array.isArray(payload.accounts) ? payload.accounts : [];
}

function writeVault(accounts) {
  assertVaultAvailable();
  fs.mkdirSync(path.dirname(vaultPath()), { recursive: true, mode: 0o700 });
  const temporary = `${vaultPath()}.tmp`;
  fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify({ version: VAULT_VERSION, accounts })), { mode: 0o600 });
  fs.renameSync(temporary, vaultPath());
}

function audioPreferencesPath() {
  return path.join(app.getPath('userData'), 'preferences', 'audio-devices.json');
}

function readAudioPreferences() {
  try {
    const value = JSON.parse(fs.readFileSync(audioPreferencesPath(), 'utf8'));
    return {
      inputDeviceId: typeof value.inputDeviceId === 'string' ? value.inputDeviceId : null,
      outputDeviceId: typeof value.outputDeviceId === 'string' ? value.outputDeviceId : null,
    };
  } catch {
    return {};
  }
}

function writeAudioPreferences() {
  const snapshot = engine.snapshot();
  const filename = audioPreferencesPath();
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({
    inputDeviceId: snapshot.inputDeviceId,
    outputDeviceId: snapshot.outputDeviceId,
  }), { mode: 0o600 });
  fs.renameSync(temporary, filename);
}

async function setAudioDevice(kind, deviceId) {
  await engine.setAudioDevice(kind, deviceId);
  writeAudioPreferences();
}

// Binário e módulos vêm do pacote do Easyphone; variáveis de ambiente servem para apontar um build local.
function baresipPaths() {
  const root = path.join(__dirname, '..', 'packaging', 'baresip');
  const binaryName = process.platform === 'win32' ? 'baresip.exe' : 'baresip';
  return {
    binaryPath: process.env.EASYPHONE_BARESIP_BIN || path.join(root, 'bin', binaryName),
    modulePath: process.env.EASYPHONE_BARESIP_MODULES || path.join(root, 'modules'),
  };
}

function systemCaFile() {
  return CA_FILE_CANDIDATES.find((file) => fs.existsSync(file));
}

function localDataPath(name) { return path.join(app.getPath('userData'), 'local-data', name); }

function readLocalList(name) {
  try {
    const value = JSON.parse(fs.readFileSync(localDataPath(name), 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function writeLocalList(name, value) {
  const filename = localDataPath(name);
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(filename), 0o700);
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, filename);
}

function callDestination(call) {
  return String(call.remoteUri || call.displayName || '');
}

function callDisplayDestination(destination) {
  const value = String(destination || '').trim();
  const uri = value.match(/(?:^|<)(?:sips?:|tel:)([^>]+)>?/i)?.[1];
  if (!uri) return value;
  if (/^tel:/i.test(uri)) return uri.slice(4).split(/[;?]/, 1)[0] || 'Chamada';
  const address = uri.replace(/^sips?:/i, '').split(/[;?]/, 1)[0];
  const user = address.slice(0, address.lastIndexOf('@'));
  return user || 'Chamada SIP';
}

function callDisplayTime(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function finishHistoryEntry(entry, timestamp) {
  if (!entry.endedAt) entry.endedAt = timestamp;
  const started = Date.parse(entry.startedAt);
  const ended = Date.parse(entry.endedAt);
  if (entry.connected && Number.isFinite(started) && Number.isFinite(ended)) {
    entry.durationSeconds = Math.max(0, Math.floor((ended - started) / 1000));
  } else {
    entry.durationSeconds = 0;
  }
  entry.displayTime = callDisplayTime(entry.startedAt);
}

function observeCall(snapshot) {
  const call = snapshot?.call;
  if (call && typeof call.id === 'string') {
    const id = call.id;
    let entry = callHistory.find((item) => item.id === id);
    const now = new Date().toISOString();
    if (!entry) {
      const destination = callDestination(call);
      const startedAt = Number.isFinite(call.startedAt) ? new Date(call.startedAt).toISOString() : now;
      entry = { id, destination, displayDestination: callDisplayDestination(destination), displayName: call.displayName || '', direction: call.direction || 'outgoing', state: call.state || 'connecting', startedAt, endedAt: null, durationSeconds: 0, displayTime: callDisplayTime(startedAt), connected: Number.isFinite(call.startedAt) };
      callHistory.unshift(entry);
    } else {
      if (!entry.explicitlyRejected) entry.state = call.state || entry.state;
      entry.displayName = call.displayName || entry.displayName;
      if (Number.isFinite(call.startedAt)) {
        entry.startedAt = new Date(call.startedAt).toISOString();
        entry.connected = true;
      }
      if (['ended', 'failed', 'rejected'].includes(entry.state)) {
        if (entry.direction === 'incoming' && !entry.connected && entry.state === 'ended') entry.state = 'missed';
        finishHistoryEntry(entry, now);
      } else {
        entry.displayTime = callDisplayTime(entry.startedAt);
      }
    }
    lastHistoryCallId = id;
    callHistory = callHistory.slice(0, 200);
    writeLocalList('call-history.json', callHistory);
  } else if (lastHistoryCallId) {
    const entry = callHistory.find((item) => item.id === lastHistoryCallId);
    if (entry && !entry.endedAt) {
      const now = new Date().toISOString();
      if (entry.direction === 'incoming' && !entry.connected && !['rejected', 'failed'].includes(entry.state)) entry.state = 'missed';
      else if (!['failed', 'rejected', 'ended'].includes(entry.state)) entry.state = 'ended';
      finishHistoryEntry(entry, now);
      writeLocalList('call-history.json', callHistory);
    }
    lastHistoryCallId = null;
  }
}

function enrichedSnapshot(snapshot) {
  observeCall(snapshot);
  return { ...snapshot, contacts: readLocalList('contacts.json'), callHistory };
}

function publish(snapshot) {
  const value = enrichedSnapshot(snapshot);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('phone:snapshot', value);
  sendNative({ type: 'snapshot', snapshot: value, engine: engineStatus() });
}

function engineStatus() {
  return {
    running: Boolean(engine?.running),
    error: engine?.engineError?.message || null,
  };
}

function sendNative(message) {
  if (!nativeFrontend || nativeFrontend.stdin.destroyed || !nativeFrontend.stdin.writable) return;
  try {
    nativeFrontend.stdin.write(`${JSON.stringify(message)}\n`);
  } catch {
    // Uma UI encerrando não pode derrubar o motor nem o processo principal.
  }
}

function nativeString(value, label) {
  if (typeof value !== 'string') throw new PhoneError('INVALID_INPUT', `${label} inválido.`);
  return value;
}

async function dispatchNative(message) {
  if (!message || !Number.isSafeInteger(message.id) || typeof message.action !== 'string' || !Array.isArray(message.args)) {
    throw new PhoneError('INVALID_INPUT', 'Comando nativo inválido.');
  }
  const args = message.args;
  switch (message.action) {
    case 'saveAccount': {
      const account = validateAccountDraft(args[0]);
      const id = crypto.randomUUID();
      engine.addAccount(id, account);
      try {
        writeVault([...readVault(), { id, ...account }]);
      } catch (err) {
        await engine.removeAccount(id).catch(() => {});
        throw err;
      }
      await engine.register(id);
      return { id };
    }
    case 'removeAccount': {
      const id = nativeString(args[0], 'Conta');
      await engine.removeAccount(id);
      writeVault(readVault().filter((entry) => entry.id !== id));
      return null;
    }
    case 'selectAccount': return engine.selectAccount(nativeString(args[0], 'Conta'));
    case 'register': return engine.register(nativeString(args[0], 'Conta'));
    case 'unregister': return engine.unregister(nativeString(args[0], 'Conta'));
    case 'dial': return engine.dial(nativeString(args[0], 'Destino'));
    case 'answer': return engine.answer(nativeString(args[0], 'Chamada'));
    case 'reject': {
      const callId = nativeString(args[0], 'Chamada');
      await engine.reject(callId);
      const entry = callHistory.find((item) => item.id === callId);
      if (entry) {
        entry.explicitlyRejected = true;
        entry.state = 'rejected';
        finishHistoryEntry(entry, new Date().toISOString());
        writeLocalList('call-history.json', callHistory);
        publish(engine.snapshot());
      }
      return null;
    }
    case 'hangup': return engine.hangup(nativeString(args[0], 'Chamada'));
    case 'setMuted':
      if (typeof args[1] !== 'boolean') throw new PhoneError('INVALID_INPUT', 'Estado de mudo inválido.');
      return engine.setMuted(nativeString(args[0], 'Chamada'), args[1]);
    case 'setHeld':
      if (typeof args[1] !== 'boolean') throw new PhoneError('INVALID_INPUT', 'Estado de espera inválido.');
      return engine.setHeld(nativeString(args[0], 'Chamada'), args[1]);
    case 'sendDtmf': return engine.sendDtmf(nativeString(args[0], 'Chamada'), nativeString(args[1], 'DTMF'));
    case 'transfer': return engine.transfer(nativeString(args[0], 'Chamada'), nativeString(args[1], 'Destino'));
    case 'setAudioDevice': return setAudioDevice(nativeString(args[0], 'Tipo'), nativeString(args[1], 'Dispositivo'));
    case 'refreshAudioDevices': return engine.refreshAudioDevices();
    case 'saveContact': {
      const draft = args[0];
      const name = typeof draft?.name === 'string' ? draft.name.trim() : '';
      const number = typeof draft?.number === 'string' ? draft.number.trim() : '';
      if (!name || name.length > 80) throw new PhoneError('INVALID_INPUT', 'Informe um nome com até 80 caracteres.');
      validateDestination(number);
      const contacts = readLocalList('contacts.json');
      const id = typeof draft.id === 'string' && contacts.some((item) => item.id === draft.id) ? draft.id : crypto.randomUUID();
      const contact = { id, name, number };
      writeLocalList('contacts.json', [contact, ...contacts.filter((item) => item.id !== id)].slice(0, 500));
      publish(engine.snapshot());
      return contact;
    }
    case 'deleteContact': {
      const id = nativeString(args[0], 'Contato');
      writeLocalList('contacts.json', readLocalList('contacts.json').filter((item) => item.id !== id));
      publish(engine.snapshot());
      return null;
    }
    case 'clearCallHistory':
      callHistory = [];
      lastHistoryCallId = null;
      writeLocalList('call-history.json', callHistory);
      publish(engine.snapshot());
      return null;
    case 'show':
      sendNative({ type: 'show' });
      return null;
    case 'quit':
      app.quit();
      return null;
    default:
      throw new PhoneError('INVALID_INPUT', 'Ação nativa não permitida.');
  }
}

function startNativeFrontend() {
  const binaryPath = process.env.EASYPHONE_NATIVE_WX_BIN ||
    path.join(__dirname, '..', 'packaging', 'native-wx', 'bin', 'easyphone-native');
  if (!fs.existsSync(binaryPath)) {
    dialog.showErrorBox('easyphone indisponível', `Executável wxWidgets não encontrado: ${binaryPath}`);
    app.quit();
    return;
  }
  nativeFrontend = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  nativeFrontend.stdin.on('error', (err) => {
    if (!isQuitting) console.error(`Canal da interface nativa encerrou: ${err.message}`);
  });
  const lines = readline.createInterface({ input: nativeFrontend.stdout, crlfDelay: Infinity });
  lines.on('line', (line) => {
    if (line.length > 32768) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    dispatchNative(message).then((value) => {
      sendNative({ type: 'result', id: message.id, ok: true, value: value ?? null });
    }).catch((err) => {
      sendNative({ type: 'result', id: message.id, ok: false, code: err.code || 'NATIVE_ERROR', error: err.message || 'Falha na operação.' });
    });
  });
  nativeFrontend.stderr.on('data', (chunk) => {
    const safe = String(chunk).replace(/\s+/g, ' ').trim().slice(0, 500);
    if (safe) console.error(`easyphone nativo: ${safe}`);
  });
  nativeFrontend.once('error', (err) => {
    console.error(`Não foi possível iniciar a interface nativa: ${err.message}`);
    if (!isQuitting) {
      dialog.showErrorBox('easyphone indisponível', 'Não foi possível abrir a interface wxWidgets.');
      app.quit();
    }
  });
  nativeFrontend.once('close', () => {
    nativeFrontend = null;
    if (!isQuitting) app.quit();
  });
  sendNative({ type: 'snapshot', snapshot: enrichedSnapshot(engine.snapshot()), engine: engineStatus() });
}

function createEngine() {
  const { binaryPath, modulePath } = baresipPaths();
  engine = createPhoneEngine({
    binaryPath,
    modulePath,
    runtimeRoot: path.join(app.getPath('userData'), 'runtime'),
    ringFile: path.resolve(__dirname, '..', 'ui', 'assets', 'easyphone-ring.wav').replaceAll('\\', '/'),
    localAddress: pickLocalAddress(),
    caFile: systemCaFile(),
    audioSelections: readAudioPreferences(),
  });
  callHistory = readLocalList('call-history.json').map((entry) => ({
    ...entry,
    displayDestination: entry.displayDestination || callDisplayDestination(entry.destination),
    displayTime: entry.displayTime || callDisplayTime(entry.startedAt),
    durationSeconds: Number(entry.durationSeconds) || 0,
    connected: entry.connected ?? (Number(entry.durationSeconds) > 0),
  }));
  engine.onSnapshot(publish);
  // Motor interrompido com o app: não deixa o Baresip órfão ocupando a porta de controle.
  process.once('exit', () => engine.supervisor.child?.kill('SIGKILL'));
}

function trustedSender(event) {
  return Boolean(mainWindow) && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedSender(event)) throw new PhoneError('UNTRUSTED_SENDER', 'Origem não autorizada.');
    return fn(...args);
  });
}

function requireString(value, name) {
  if (typeof value !== 'string') throw new PhoneError('INVALID_INPUT', `${name} inválido.`);
  return value;
}

function registerIpc() {
  handle('phone:snapshot', () => engine.snapshot());

  handle('phone:saveAccount', async (draft) => {
    const account = validateAccountDraft(draft);
    const id = crypto.randomUUID();
    engine.addAccount(id, account);
    try {
      const stored = readVault();
      writeVault([...stored, { id, ...account }]);
    } catch (err) {
      await engine.removeAccount(id).catch(() => {});
      throw err;
    }
    return { id };
  });

  handle('phone:removeAccount', async (accountId) => {
    await engine.removeAccount(requireString(accountId, 'Conta'));
    writeVault(readVault().filter((entry) => entry.id !== accountId));
  });

  handle('phone:selectAccount', (accountId) => engine.selectAccount(requireString(accountId, 'Conta')));
  handle('phone:register', (accountId) => engine.register(requireString(accountId, 'Conta')));
  handle('phone:unregister', (accountId) => engine.unregister(requireString(accountId, 'Conta')));
  handle('phone:dial', (destination) => engine.dial(requireString(destination, 'Destino')));
  handle('phone:answer', (callId) => engine.answer(requireString(callId, 'Chamada')));
  handle('phone:reject', (callId) => engine.reject(requireString(callId, 'Chamada')));
  handle('phone:hangup', (callId) => engine.hangup(requireString(callId, 'Chamada')));
  handle('phone:setMuted', (callId, muted) => {
    if (typeof muted !== 'boolean') throw new PhoneError('INVALID_INPUT', 'Estado de mudo inválido.');
    return engine.setMuted(requireString(callId, 'Chamada'), muted);
  });
  handle('phone:setHeld', (callId, held) => {
    if (typeof held !== 'boolean') throw new PhoneError('INVALID_INPUT', 'Estado de espera inválido.');
    return engine.setHeld(requireString(callId, 'Chamada'), held);
  });
  handle('phone:sendDtmf', (callId, digits) => engine.sendDtmf(requireString(callId, 'Chamada'), requireString(digits, 'DTMF')));
  handle('phone:transfer', (callId, destination) => engine.transfer(requireString(callId, 'Chamada'), requireString(destination, 'Destino')));
  handle('phone:setAudioDevice', (kind, deviceId) => setAudioDevice(requireString(kind, 'Tipo'), requireString(deviceId, 'Dispositivo')));
  handle('phone-shell:set-mode', (mode) => applyWindowMode(requireString(mode, 'Modo')));

  // Marca: o renderer nunca envia caminho. O arquivo vem só do diálogo nativo e é validado aqui.
  handle('phone-branding:get', () => {
    const logo = brandingStore().load();
    return logo ? { mime: logo.mime, data: logo.bytes.toString('base64') } : null;
  });
  handle('phone-branding:choose', async () => {
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Escolher logo',
      properties: ['openFile'],
      filters: [{ name: 'Imagens PNG, JPEG ou WebP', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) return { status: 'cancelled' };
    brandingStore().save(picked.filePaths[0]);
    return { status: 'saved' };
  });
  handle('phone-branding:reset', () => {
    brandingStore().reset();
    return { status: 'reset' };
  });
}

let branding = null;
function brandingStore() {
  branding ??= createBrandingStore(path.join(app.getPath('userData'), 'branding'));
  return branding;
}

// Tamanhos lógicos alinhados a renderer/demo/main.cjs. O Zoiper não foi medido (ADR 0003): são provisórios.
const WINDOW_MODES = {
  normal: { width: 380, height: 680, minWidth: 340, minHeight: 560 },
  compact: { width: 380, height: 184, minWidth: 340, minHeight: 160 },
};
let windowMode = 'normal';
let normalContentSize = { width: WINDOW_MODES.normal.width, height: WINDOW_MODES.normal.height };

// Só troca o tamanho da janela; não expõe nada além disso ao renderer.
function applyWindowMode(next) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new PhoneError('WINDOW_UNAVAILABLE', 'Janela indisponível.');
  if (!Object.hasOwn(WINDOW_MODES, next)) throw new PhoneError('INVALID_INPUT', 'Modo de janela inválido.');
  if (next === windowMode) return;
  if (windowMode === 'normal') {
    const [width, height] = mainWindow.getContentSize();
    normalContentSize = { width, height };
  }
  const target = WINDOW_MODES[next];
  windowMode = next;
  mainWindow.setMinimumSize(target.minWidth, target.minHeight);
  const size = next === 'normal' ? normalContentSize : target;
  mainWindow.setContentSize(size.width, size.height);
}

function createWindow() {
  // Keep the native OS window controls, with no generic Electron menu bar.
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: WINDOW_MODES.normal.width,
    height: WINDOW_MODES.normal.height,
    minWidth: WINDOW_MODES.normal.minWidth,
    minHeight: WINDOW_MODES.normal.minHeight,
    title: 'easyphone',
    icon: path.join(__dirname, '..', 'ui', 'assets', 'easyphone-icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('minimize', (event) => {
    if (tray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('close', (event) => {
    if (tray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

function showMainWindow() {
  if (nativeUiMode) {
    sendNative({ type: 'show' });
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, '..', 'ui', 'assets', 'easyphone-icon.png'));
    tray.setToolTip('easyphone');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir easyphone', click: showMainWindow },
      { type: 'separator' },
      { label: 'Sair do easyphone', click: () => app.quit() },
    ]));
    tray.on('click', showMainWindow);
    return true;
  } catch (err) {
    console.error(`Bandeja do sistema indisponível: ${err.message}`);
    tray = null;
    return false;
  }
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  createEngine();
  registerIpc();
  createTray();
  if (!nativeUiMode) createWindow();
  try {
    engine.loadAccounts(readVault());
  } catch (err) {
    console.error(`Contas não carregadas: ${err.message}`);
  }
  try {
    await engine.start();
    // A desktop softphone should restore its saved lines on launch so it can receive queue calls.
    for (const account of engine.snapshot().accounts) {
      try {
        await engine.register(account.id);
      } catch (err) {
        console.error(`Registro SIP falhou para ${account.label}: ${err.code || 'ENGINE_ERROR'}`);
      }
    }
  } catch (err) {
    console.error(`Motor de telefonia indisponível: ${err.message}`);
  }
  if (nativeUiMode) startNativeFrontend();
});

app.on('window-all-closed', () => {
  if (!tray) app.quit();
});

app.on('activate', showMainWindow);

app.on('before-quit', (event) => {
  isQuitting = true;
  if (shuttingDown) return;
  shuttingDown = true;
  tray?.destroy();
  tray = null;
  if (nativeFrontend && !nativeFrontend.killed) nativeFrontend.kill('SIGTERM');
  if (!engine) return;
  event.preventDefault();
  engine.stop().catch(() => {}).finally(() => app.quit());
});
