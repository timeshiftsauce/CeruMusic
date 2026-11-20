import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { generateSigningKeys, signArtifact } = createRequire(import.meta.url)('@shiqianjiang/ceru-plugin-issuer')

export async function verifyTrustedRuntime(application, page) {
  const manifest = {
    manifestVersion: 3, id: 'test.utility-desktop', name: '独立进程验收', publisher: 'Local QA', version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'main' }, server: { module: 'server.main', runtime: 'node' } },
    uses: { permissions: [
      { key: 'trusted', name: 'runtime.trusted', optional: true, reason: '在独立进程中运行本机测试服务并验证授权撤销' },
      { key: 'serve', name: 'network.serve', reason: '在本机提供独立进程测试服务' },
      { key: 'unused', name: 'clipboard.read', optional: true, reason: '验证普通授权更新保留独立进程' }
    ] },
    provides: { actions: [{ id: 'status', title: 'Status' }] },
    ui: { menus: [{ id: 'status', title: 'Status', slot: 'playlist.import', commandId: 'status' }] }
  }
  const source = 'exports.manifest=' + JSON.stringify(manifest) + `;exports.activate=ctx=>{
    ctx.actions.register('status',()=>({url:ctx.server.url??null,alive:true}));
  };
  const Server=/* @ceru-self-contained */ async function(ctx){
    await ctx.server.listen((_req,res)=>{
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({pid:process.pid,electron:process.versions.electron,permission:!!process.permission}));
    });
  };exports.modules={'server.main':Server};`
  const keys = generateSigningKeys()
  const signed = signArtifact(Buffer.from(source), keys.privateKey).toString()
  const approve = async () => {
    const dialog = page.locator('.t-dialog:visible').filter({ hasText: '此插件需要完全信任' })
    await dialog.waitFor({ timeout: 15000 })
    assert.match(await dialog.innerText(), /可以访问你电脑上的所有文件，也可以启动其他程序/)
    const confirm = dialog.getByRole('button', { name: '同意并安装 / 开启', exact: true })
    assert.equal(await confirm.isEnabled(), false)
    await dialog.getByText('我了解风险', { exact: true }).click()
    assert.equal(await confirm.isEnabled(), true)
    await confirm.click()
    await dialog.waitFor({ state: 'hidden' })
  }
  let owner
  const detail = () => page.evaluate(id => window.ceruQa.plugins.trustedDetail(id), owner)
  const status = () => page.evaluate(id => window.ceruQa.plugins.openPlaylistImportMenu(id, 'status'), owner)
  const enable = value => page.evaluate(([id, value]) => window.ceruQa.plugins.setEnabled(id, value), [owner, value])
  const until = async predicate => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      if (await predicate()) return
      await new Promise(resolve => setTimeout(resolve, 60))
    }
    throw Error('Trusted desktop expectation timed out')
  }
  const closed = async url => {
    await until(async () => {
      try { await fetch(url, { signal: AbortSignal.timeout(500) }); return false } catch { return true }
    })
  }
  const assertUtility = async url => {
    const info = await (await fetch(url)).json()
    const evidence = await application.evaluate(({ app }, pid) => ({
      parentPid: process.pid, utility: app.getAppMetrics().find(row => row.pid === pid)
    }), info.pid)
    assert.notEqual(info.pid, evidence.parentPid)
    assert.ok(info.electron)
    assert.equal(info.permission, false)
    assert.equal(evidence.utility?.type, 'Utility')
    assert.equal(evidence.utility?.name, 'Ceru trusted plugin')
    return info
  }
  // Start the asynchronous install, then drive the real application consent UI.
  const installing = page.evaluate(code => window.ceruQa.plugins.addPlugin(code, 'utility-desktop.js'), signed)
  installing.catch(() => {})
  try {
    await approve()
    const installed = await installing
    assert.ok(installed.pluginId, installed.error)
    owner = installed.pluginId
    assert.equal((await detail()).granted, true)
    await page.evaluate(id => window.ceruQa.plugins.savePermissions(id, ['serve']), owner)
    assert.equal((await enable(true)).error, undefined)
    let current = await status()
    assert.equal(current.alive, true)
    const first = await assertUtility(current.url)
    await page.evaluate(id => window.ceruQa.plugins.savePermissions(id, ['serve', 'unused']), owner)
    assert.deepEqual(await status(), current)
    assert.equal((await assertUtility(current.url)).pid, first.pid)
    await enable(false)
    await closed(current.url)
    await enable(true)
    current = await status()
    const resumed = await assertUtility(current.url)
    assert.notEqual(resumed.pid, first.pid)
    assert.equal(await page.locator('.t-dialog:visible').filter({ hasText: '此插件需要完全信任' }).count(), 0)
    await page.evaluate(id => window.ceruQa.plugins.setTrustedConsent(id, false), owner)
    await closed(current.url)
    assert.equal((await detail()).granted, false)
    assert.deepEqual(await status(), { url: null, alive: true })
    const granting = page.evaluate(id => window.ceruQa.plugins.setTrustedConsent(id, true), owner)
    granting.catch(() => {})
    await approve()
    assert.equal((await granting).granted, true)
    current = await status()
    await assertUtility(current.url)
    await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id), owner)
    owner = undefined
    await closed(current.url)
    console.log(JSON.stringify({ trustedDesktop: true, installAcknowledgement: true,
      transport: 'utilityProcess + MessagePort', normalGrantsPreserveProcess: true,
      disableClosesPort: true, reenableUsesSavedConsent: true, revokePreservesSandbox: true,
      regrantRequiresAcknowledgement: true, uninstallClosesPort: true }))
  } finally {
    if (owner) await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id), owner)
  }
}
