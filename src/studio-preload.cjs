const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('studio', {
  getState: () => ipcRenderer.invoke('studio:get-state'),
  saveSkin: skin => ipcRenderer.invoke('studio:save-skin', skin),
  resetSkin: () => ipcRenderer.invoke('studio:reset-skin'),
  setAutoCheckUpdates: enabled => ipcRenderer.invoke('studio:set-auto-check-updates', enabled),
  checkForUpdates: () => ipcRenderer.invoke('studio:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('studio:download-update'),
  installUpdate: () => ipcRenderer.invoke('studio:install-update'),
  onStateChanged: listener => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('studio:state-changed', handler)
    return () => ipcRenderer.removeListener('studio:state-changed', handler)
  },
})
