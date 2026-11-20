import assert from 'node:assert/strict'

export async function verifyComponentRuntime(application, page) {
  const before = await page.evaluate(async () => (await window.ceruQa.plugins.contributions()).map(row => row.pluginId).sort())
  const regionManifest = {
    manifestVersion: 3, id: 'test.region-policy', name: '区域限制验收', version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'main' }, views: [{ id: 'region', kind: 'component', module: 'view.region' }] },
    ui: { regions: [{ region: 'player.artwork', view: 'region' }] }
  }
  for (const expression of ['new Worker("worker.js")', 'new SharedWorker("worker.js")', 'WebAssembly.compile(new Uint8Array())']) {
    const code = 'exports.manifest=' + JSON.stringify(regionManifest) + ';exports.modules={main:function(){},"view.region":function(deps){return bridge=>{' + expression + '}}}'
    const rejected = await page.evaluate(async code => {
      try { return await window.ceruQa.plugins.addPlugin(code, 'invalid-region.js') }
      catch (error) { return { error: error.message } }
    }, code)
    assert.equal(rejected.pluginId, undefined)
    assert.match(rejected.error, /Component policy rejects/)
  }
  assert.deepEqual(await page.evaluate(async () => (await window.ceruQa.plugins.contributions()).map(row => row.pluginId).sort()), before)
  const manifest = {
    manifestVersion: 3, id: 'test.host-components', name: '宿主组件验收', version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'main' }, views: [{ id: 'page', kind: 'component', module: 'view.page' }, { id: 'slot', kind: 'component', module: 'view.slot' }] },
    provides: { actions: [{ id: 'increment', title: 'Increment' }] },
    ui: { pages: [{ id: 'page', title: '共享组件验收', view: 'page', mount: 'sidebar' }], slots: [{ id: 'slot', slot: 'playlist.header.actions', mode: 'append', view: 'slot' }] }
  }
  const factory = `function(deps){return function(bridge){
    const {vue,sdk,tdesign}=deps;
    bridge.root.host.dataset.probe=JSON.stringify({vue:vue.version,mode:bridge.root.mode,
      frozen:Object.isFrozen(bridge.props)});
    const View=vue.defineComponent({setup(){const view=sdk.useView();const show=vue.ref(false);
      vue.watchEffect(()=>{bridge.root.host.dataset.count=String(view.state.value.count||0)});
      return ()=>vue.h('main',{},[
        vue.h(view.components.PageHeader,{title:'Shared component page'}),
        vue.h(tdesign.Button,{onClick:()=>view.invoke('increment')},()=> 'Increment'),
        vue.h(tdesign.Button,{onClick:()=>show.value=true},()=> 'Open dialog'),
        vue.h(tdesign.Dialog,{visible:show.value,header:'Shared overlay',onClose:()=>show.value=false,onConfirm:()=>show.value=false},()=> 'Outside the slot')]);
    }});return sdk.mountComponent(View,bridge)
  }}`
  const code = 'exports.manifest=' + JSON.stringify(manifest) + `;exports.activate=ctx=>{
    let count=0;ctx.actions.register('increment',()=>{ctx.ui.views.setState('page',{count:++count});return count});
  };exports.modules={'view.page':${factory},'view.slot':${factory}};`
  const installed = await page.evaluate(code => window.ceruQa.plugins.addPlugin(code, 'host-components.js'), code)
  assert.ok(installed.pluginId, installed.error)
  const owner = installed.pluginId
  const navigate = route => page.evaluate(route => { location.hash = route }, route)
  const root = () => page.locator('.plugin-page .component-root[data-probe]')
  const protocol = await page.context().newCDPSession(page)
  await protocol.send('DOM.enable')
  const findButton = async (label, scope = 'component-root') => {
    const document = (await protocol.send('DOM.getDocument', { depth: -1, pierce: true })).root
    const text = node => (node.nodeValue || '') + (node.children || []).map(text).join('')
    const find = (node, allowed = false) => {
      const attrs = Object.fromEntries(Array.from({ length: (node.attributes || []).length / 2 }, (_, i) => [node.attributes[i*2], node.attributes[i*2+1]]))
      allowed ||= attrs.class?.split(' ').includes(scope)
      if (allowed && node.nodeName === 'BUTTON' && text(node).trim() === label) return node.backendNodeId
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) { const match = find(child, allowed); if (match) return match }
    }
    const found = find(document)
    assert.ok(found, 'Button not found: ' + label)
    return found
  }
  const click = async (label, scope) => {
    let backendNodeId
    const deadline = Date.now() + 5000
    while (!backendNodeId && Date.now() < deadline) {
      try { backendNodeId = await findButton(label, scope) }
      catch { await new Promise(resolve => setTimeout(resolve, 50)) }
    }
    assert.ok(backendNodeId, 'Button not found: ' + label)
    await protocol.send('DOM.focus', { backendNodeId })
    await page.keyboard.press('Enter')
  }
  try {
    await page.evaluate(id => window.ceruQa.plugins.setEnabled(id, true), owner)
    await navigate('/plugin/' + owner + '/page')
    await root().waitFor()
    const probe = JSON.parse(await root().getAttribute('data-probe'))
    assert.deepEqual(probe, { vue: '3.5.21', mode: 'closed', frozen: true })
    assert.deepEqual(await page.evaluate(() => ({api:typeof window.api,electron:typeof window.electron})), {api:'undefined',electron:'undefined'})
    assert.equal(await root().evaluate(node => node.shadowRoot === null), true)
    assert.equal(await page.locator('.plugin-page iframe').count(), 0)
    await click('Increment')
    await page.waitForFunction(() => document.querySelector('.plugin-page .component-root')?.dataset.count === '1')
    await click('Open dialog')
    await page.waitForFunction(() => document.querySelector('.plugin-component-overlay')?.getBoundingClientRect().height >= 0)
    await click('确认', 'plugin-component-overlay')
    await navigate('/home/songlist')
    await page.locator('.plugin-slot .component-root[data-probe]').waitFor()
    assert.equal(await page.locator('.plugin-slot iframe').count(), 0)
    await navigate('/settings?category=plugins')
    await page.getByRole('button', { name: '管理设置', exact: true }).click()
    const panel = page.getByRole('dialog', { name: '插件管理设置' })
    await panel.getByRole('switch', { name: '插件严格模式' }).click()
    await page.waitForFunction(() => window.ceruQa.plugins.strictMode())
    await panel.getByRole('button', { name: '关闭插件管理设置' }).click()
    await navigate('/plugin/' + owner + '/page')
    const iframe = page.locator('.plugin-page iframe')
    await iframe.waitFor()
    assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts')
    const frame = await (await iframe.elementHandle()).contentFrame()
    await frame.locator('#plugin-root[data-probe]').waitFor()
    assert.equal(JSON.parse(await frame.locator('#plugin-root').getAttribute('data-probe')).mode, 'closed')
    await navigate('/home/songlist')
    assert.equal(await page.locator('.plugin-slot').count(), 0)
    console.log(JSON.stringify({ regionWorkerAndWasmRejectedBeforeInstall: true, sharedRendererComponents: true, hostVue: probe.vue,
      closedShadowRoot: true, actionAndState: true, hostTDesignOverlay: true,
      directSlot: true, strictIframeFallback: true, strictHidesSlots: true }))
  } finally {
    await protocol.detach()
    await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id), owner)
  }
}
