require('electron')
  .app.whenReady()
  .then(() => import('./plugin-drawer-storage-smoke.mjs'))
  .catch((error) => {
    console.error(error)
    require('electron').app.exit(1)
  })
