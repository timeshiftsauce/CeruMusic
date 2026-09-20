const { ipcRenderer } = require('electron')
const allowed = new Set(['ready', 'active', 'failed', 'register', 'unregister', 'invoke-result', 'rpc', 'log', 'notify', 'state', 'open-view'])
let count = 0
setInterval(() => { count = 0 }, 1000)
window.addEventListener('message', event => {
  if (event.source !== window || !event.data || !allowed.has(event.data.type)) return
  if (++count > 1000) return
  let encoded
  try { encoded = JSON.stringify(event.data) } catch { return }
  if (encoded.length > 8 * 1024 * 1024) return
  ipcRenderer.send('ceru:runtime', JSON.parse(encoded))
})
