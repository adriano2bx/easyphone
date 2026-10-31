'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Ponte estreita para window.phone (contrato em contracts/phone-bridge.d.ts). Não expõe ipcRenderer, Node nem o motor.
const SNAPSHOT_CHANNEL = 'phone:snapshot';

contextBridge.exposeInMainWorld('phone', {
  snapshot: () => ipcRenderer.invoke('phone:snapshot'),
  onSnapshot(listener) {
    const wrapped = (_event, snapshot) => listener(snapshot);
    ipcRenderer.on(SNAPSHOT_CHANNEL, wrapped);
    return () => ipcRenderer.removeListener(SNAPSHOT_CHANNEL, wrapped);
  },
  saveAccount: (draft) => ipcRenderer.invoke('phone:saveAccount', draft),
  removeAccount: (accountId) => ipcRenderer.invoke('phone:removeAccount', accountId),
  selectAccount: (accountId) => ipcRenderer.invoke('phone:selectAccount', accountId),
  register: (accountId) => ipcRenderer.invoke('phone:register', accountId),
  unregister: (accountId) => ipcRenderer.invoke('phone:unregister', accountId),
  dial: (destination) => ipcRenderer.invoke('phone:dial', destination),
  answer: (callId) => ipcRenderer.invoke('phone:answer', callId),
  reject: (callId) => ipcRenderer.invoke('phone:reject', callId),
  hangup: (callId) => ipcRenderer.invoke('phone:hangup', callId),
  setMuted: (callId, muted) => ipcRenderer.invoke('phone:setMuted', callId, muted),
  setHeld: (callId, held) => ipcRenderer.invoke('phone:setHeld', callId, held),
  sendDtmf: (callId, digits) => ipcRenderer.invoke('phone:sendDtmf', callId, digits),
  transfer: (callId, destination) => ipcRenderer.invoke('phone:transfer', callId, destination),
  setAudioDevice: (kind, deviceId) => ipcRenderer.invoke('phone:setAudioDevice', kind, deviceId),
});

// Ponte separada da telefonia: só troca o modo de janela (normal ou compacto), como o renderer espera em app.js.
contextBridge.exposeInMainWorld('phoneShell', {
  setWindowMode: (mode) => ipcRenderer.invoke('phone-shell:set-mode', mode),
});

// Marca personalizada (contrato BrandingBridge). Sem caminhos: o arquivo é escolhido pelo diálogo do main process.
contextBridge.exposeInMainWorld('phoneBranding', {
  getLogo: () => ipcRenderer.invoke('phone-branding:get'),
  chooseLogo: () => ipcRenderer.invoke('phone-branding:choose'),
  resetLogo: () => ipcRenderer.invoke('phone-branding:reset'),
});
