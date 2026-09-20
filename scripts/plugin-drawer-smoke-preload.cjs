const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('drawerTest', {
  ready: () => ipcRenderer.invoke('plugin:ui-ready', true)
})
ipcRenderer.on('plugin:ui', (_event, request) => {
  ipcRenderer.send('drawer-test:request', request)
  void ipcRenderer.invoke('plugin:ui-result', { id: request.id, value: null })
})
