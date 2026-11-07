const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nativo', {
  fontes: () => ipcRenderer.invoke('fontes'),
  appsAudio: () => ipcRenderer.invoke('apps-audio'),
  audioIniciar: (id, pid) => ipcRenderer.invoke('audio-iniciar', id, pid),
  audioParar: () => ipcRenderer.invoke('audio-parar'),
  onAudio: cb => ipcRenderer.on('audio-dados', (_, d) => cb(d)),
  onAudioFim: cb => ipcRenderer.on('audio-fim', (_, c) => cb(c)),
});
