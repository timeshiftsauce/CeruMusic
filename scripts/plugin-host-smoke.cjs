const { app } = require('electron')
app
  .whenReady()
  .then(() => import('./plugin-host-smoke.mjs'))
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
