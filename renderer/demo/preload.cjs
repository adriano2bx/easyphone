const { contextBridge, ipcRenderer } = require('electron');

// Somente a troca de modo de janela. Nada de Node, arquivos ou socket do motor.
contextBridge.exposeInMainWorld('phoneShell', {
  setWindowMode: (mode) => ipcRenderer.invoke('phone-shell:set-mode', mode),
});
