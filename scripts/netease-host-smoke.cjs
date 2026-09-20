const { app } = require('electron')
const { pathToFileURL } = require('node:url')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')
const assert = require('node:assert/strict')
const [artifact, bundle, directory] = process.argv.slice(2)
mkdirSync(join(directory, 'user-data'), { recursive: true })
app.setPath('userData', join(directory, 'user-data'))
app.setPath('sessionData', join(directory, 'user-data'))
app
  .whenReady()
  .then(async () => {
    let host
    try {
      for (const subpath of ['guests', 'surface', 'surface-document']) {
        assert.ok(require.resolve('@shiqianjiang/ceru-plugin-core/' + subpath))
      }
      const { default: PluginHost } = await import(pathToFileURL(bundle).href)
      host = new PluginHost()
      host.pluginId = 'netease-host-smoke'
      await host.loadPlugin(artifact)
      assert.equal(host.getManifest().id, 'ceru.netease-account')
      assert.deepEqual(
        host.getManifest().contributes.providers.map((provider) => provider.id),
        ['wy']
      )
      assert.equal(host.getManifest().contributes.sidebarItems?.length ?? 0, 0)
      const accountItem = host.getManifest().contributes.accountItems[0]
      assert.equal((await host.invokeV2Action(accountItem.action, {})).signedIn, false)
      for (const surfaceId of ['daily', 'library']) {
        const native = await host.mountSurface(surfaceId)
        assert.equal(native.kind, 'native')
        assert.equal('html' in native, false, 'Native views contain no web document')
        await host.readySurface(surfaceId, native.sessionId)
        const view = await host.invokeSurfaceAction(
          surfaceId,
          native.sessionId,
          native.renderAction,
          {}
        )
        assert.equal(view.type, 'page')
        assert.ok(view.actions.some((action) => action.action === 'open'))
        await host.closeDrawer(surfaceId, native.sessionId)
        await assert.rejects(
          host.invokeSurfaceAction(surfaceId, native.sessionId, native.renderAction, {}),
          /关闭/
        )
      }
      host.setGrantedPermissions(['netease.network'])
      const surface = await host.mountSurface('account')
      assert.equal(surface.kind, 'web')
      assert.equal(surface.presentation.kind, 'modal')
      assert.equal(surface.presentation.size, 480)
      assert.match(surface.html, /plugin-root/)
      await host.readySurface('account', surface.sessionId)
      const call = (action, input = {}) =>
        host.invokeSurfaceAction('account', surface.sessionId, action, input)
      assert.equal((await call('account.session')).loggedIn, false)
      assert.equal((await call('account.start', { attemptId: 'desktop-smoke' })).status, 'waiting')
      assert.ok(
        ['waiting', 'scanned'].includes(
          (await call('account.poll', { attemptId: 'desktop-smoke' })).status
        )
      )
      await host.closeDrawer('account', surface.sessionId)
      await assert.rejects(call('account.session'), /关闭/)
      assert.equal(
        (await host.invokeV2Action('account.poll', { attemptId: 'desktop-smoke' })).status,
        'expired'
      )
      const reopened = await host.mountSurface('account')
      await host.readySurface('account', reopened.sessionId)
      assert.equal(
        (await host.invokeSurfaceAction('account', reopened.sessionId, 'account.session', {}))
          .loggedIn,
        false
      )
      await host.closeDrawer('account', reopened.sessionId)
      console.log(
        'PASS: Electron Core exports, native Surface lifecycle, wy provider, account summary, real QR cancellation and reopen'
      )
    } catch (error) {
      console.error(error)
      process.exitCode = 1
    } finally {
      await host?.destroy()
      app.exit(process.exitCode || 0)
    }
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
