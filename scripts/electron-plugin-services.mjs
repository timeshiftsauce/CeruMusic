import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { addPreviewFile } from './electron-dev-preview.mjs'

export async function verifyServicePreviews(application, page, directory) {
  const consumer = join(directory, 'service-consumer.js'),
    provider = join(directory, 'service-provider.js')
  const base = {
    manifestVersion: 3,
    version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' }
  }
  const file = (manifest, code) =>
    'exports.manifest=' + JSON.stringify({ ...base, ...manifest }) + ';exports.activate=' + code
  const supplier = 'test.preview-provider',
    client = 'test.preview-consumer'
  await writeFile(
    provider,
    file(
      {
        id: supplier,
        name: '验收服务端',
        entry: { logic: { module: 'logic.main' } },
        provides: { services: [{ id: 'echo', version: '1.2.0', methods: ['reply'] }] }
      },
      'function(ctx){ctx.services.register("echo",{reply:(input,call)=>input.message+" · "+call.callerPluginId})}'
    )
  )
  await writeFile(
    consumer,
    file(
      {
        id: client,
        name: '验收依赖方',
        entry: {
          logic: { module: 'logic.main' },
          views: [{ id: 'panel', kind: 'native', module: 'render' }]
        },
        provides: { actions: [{ id: 'render', title: '展示' }] },
        uses: {
          permissions: [{ key: 'consume', name: 'services.consume', reason: '调用回声服务' }],
          plugins: [{ pluginId: supplier, service: 'echo', version: '^1.0' }]
        },
        ui: { pages: [{ id: 'service', title: '服务验证入口', mount: 'sidebar', view: 'panel' }] }
      },
      'async function(ctx){ctx.actions.register("render",async()=>{const api=await ctx.plugins.use("test.preview-provider","echo");return {type:"page",title:await api.reply({message:"服务回声"}),sections:[]}})}'
    )
  )
  const entry = await addPreviewFile(application, page, consumer)
  try {
    await page.evaluate(() => {
      location.hash = '/settings?category=plugins'
    })
    const row = page
      .locator('.plugin-item')
      .filter({ has: page.getByRole('heading', { name: '验收依赖方', exact: true }) })
    await row.getByRole('button', { name: '去安装依赖' }).waitFor()
    assert.match(await row.innerText(), /缺少依赖 test.preview-provider/)
    await page.evaluate((id) => window.ceruQa.plugins.savePermissions(id, ['consume']), entry.id)
    const openView = async () => {
      await page.evaluate(() => { location.hash = '/home/local' })
      await page.waitForURL(url => url.hash === '#/home/local')
      await page
        .locator('.sidebar')
        .getByRole('button', { name: '服务验证入口', exact: true })
        .click()
      await page.getByRole('heading', { name: '服务回声 · ' + client, exact: true }).waitFor()
    }
    await addPreviewFile(application, page, provider)
    await openView()
    const compatible = await readFile(provider, 'utf8')
    const incompatible = compatible.replace('"version":"1.2.0"', '"version":"2.0.0"')
    assert.notEqual(compatible, incompatible)
    await writeFile(provider, incompatible)
    await page.evaluate(() => { location.hash = '/settings?category=plugins' })
    await row.getByText(/缺少依赖 test\.preview-provider（服务 echo \^1\.0）/).first().waitFor()
    await page.waitForFunction(id => window.ceruQa.plugins.loadAllPlugins().then(items =>
      items.some(item => item.pluginId === id && item.status === 'blocked' && item.requestedEnabled && !item.enabled)), entry.id)
    await writeFile(provider, compatible)
    await openView()
    await page.evaluate((path) => window.ceruQa.plugins.removeDevFile(path), provider)
    await page.waitForFunction(
      async (id) =>
        (await window.ceruQa.plugins.loadAllPlugins()).some(
          (item) =>
            item.pluginId === id &&
            item.status === 'blocked' &&
            item.requestedEnabled &&
            !item.enabled
        ),
      entry.id
    )
    await page.evaluate(() => {
      location.hash = '/home/local'
    })
    await addPreviewFile(application, page, provider)
    await openView()
    assert.equal(
      (await page.evaluate(() => window.ceruQa.plugins.devState())).entries.filter((item) =>
        [consumer, provider].includes(item.path)
      ).length,
      2
    )
    console.log(
      'Two development plugins: blocked card and install action, real echo with caller identity, provider removal and automatic recovery passed'
    )
  } finally {
    await page.evaluate(() => {
      location.hash = '/home/local'
    })
    for (const file of [consumer, provider])
      await page.evaluate(async (path) => {
        if ((await window.ceruQa.plugins.devState()).entries.some((item) => item.path === path))
          await window.ceruQa.plugins.removeDevFile(path)
      }, file)
  }
}

export async function verifyServiceCycles(page) {
  const members = ['qa.cycle-left', 'qa.cycle-right'], installed = []
  try {
    for (const [index, id] of members.entries()) {
      const manifest = {manifestVersion:3,id,name:'循环验收 '+id,version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},
        entry:{logic:{module:'logic.main'}},provides:{services:[{id:'echo',version:'1.0.0',methods:['reply']}]},
        uses:{plugins:[{pluginId:members[1-index],service:'echo',version:'^1.0'}]}}
      const code='exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{ctx.services.register("echo",{reply:()=>true})}'
      const added=await page.evaluate(([code,id])=>window.ceruQa.plugins.addPlugin(code,id+'.js'),[code,id])
      assert.ok(added.pluginId,added.error)
      installed.push(added.pluginId)
    }
    for (const id of installed) await page.evaluate(id => window.ceruQa.plugins.setEnabled(id,true),id)
    await page.evaluate(() => {location.hash='/settings?category=plugins'})
    for (const [index,id] of members.entries()) {
      const row=page.locator('.plugin-item').filter({has:page.getByRole('heading',{name:'循环验收 '+id,exact:true})})
      await row.getByText('插件依赖成环：'+id,{exact:false}).first().waitFor()
      const state=await page.evaluate(id=>window.ceruQa.plugins.loadAllPlugins().then(items=>items.find(item=>item.pluginId===id)),installed[index])
      assert.equal(state.status,'blocked');assert.equal(state.enabled,false);assert.equal(state.requestedEnabled,true)
    }
    console.log('Installed service cycle: both cards report the cycle, both remain stopped with enable intent retained.')
  } finally {
    for (const id of installed.reverse()) await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id),id)
  }
}
