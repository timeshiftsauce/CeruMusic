import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { useAuthorSdk } from './electron-dev-preview.mjs'

export async function verifyAccountTab(page, restart, artifact) {
  const added = await page.evaluate(code => window.ceruQa.plugins.addPlugin(code, 'author-library.js'), await readFile(artifact, 'utf8'))
  assert.ok(added.pluginId, added.error)
  const id = added.pluginId
  const tab = () => page.locator('.find-tabs .n-tabs-nav').getByText('已连接的音乐库', { exact: true })
  const discover = async () => {
    await page.evaluate(() => { location.hash = '/home/find' })
    await page.getByRole('heading', { name: '发现音乐', exact: true }).waitFor()
  }
  const selectLibrary = async () => {
    const trigger = page.getByRole('button', { name: '选择音源', exact: true })
    if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
    await page.locator('.source-list').getByRole('button', { name: '开发包曲库', exact: true }).click()
  }
  const account = () => page.evaluate(id => window.ceruQa.plugins.accountConnections(id, 'catalog'), id)
  const form = () => page.locator('.t-dialog').filter({ hasText: '演示昵称' })
  try {
    assert.equal((await page.evaluate(id => window.ceruQa.plugins.setEnabled(id, true), id)).error, undefined)
    assert.equal(await tab().count(), 0)
    await selectLibrary()
    await form().getByRole('button', { name: '取消', exact: true }).click()
    await form().waitFor({ state: 'hidden' })
    assert.deepEqual(await account(), { active: null, rows: [] })
    assert.equal(await tab().count(), 0)
    await selectLibrary()
    await form().locator('input').fill('桌面演示')
    await form().getByRole('button', { name: '确定', exact: true }).click()
    await form().waitFor({ state: 'hidden' })
    await discover()
    await tab().click()
    const nativeContent = () => page.locator('.find-tabs .plugin-page').getByText('演示歌单', { exact: true })
    await nativeContent().waitFor()
    const selected = (await account()).active
    assert.ok(selected)
    page = await restart()
    await discover()
    await tab().click()
    await nativeContent().waitFor()
    assert.equal((await account()).active, selected)
    assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('audio')).some(audio => !audio.paused)), false)
    await page.locator('.user-capsule').hover()
    await page.locator('[data-plugin-account="plugin-account:' + id + ':catalog"]').hover()
    await page.getByText('退出当前账号', { exact: true }).click()
    await tab().waitFor({ state: 'detached' })
    assert.equal(await tab().count(), 0)
    assert.equal(await nativeContent().count(), 0)
    assert.deepEqual(await account(), { active: null, rows: [] })
    console.log('Author library: canceled source login, account-gated native discovery, cold restore without playback and last-account logout passed.')
  } finally {
    if (!page.isClosed()) await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id), id)
  }
}

export async function verifyAccountForm(page,directory,profile,toolchain) {
  const bin = resolve(toolchain,'packages/cli/dist/bin.js'), project = join(directory,'account-demo')
  const run = args => promisify(execFile)(process.execPath,[bin,...args],{windowsHide:true})
  await run(['init',project,'--template','connected-library','--lang','ts'])
  await useAuthorSdk(project, toolchain)
  await run(['build','--project',project])
  const file = await readFile(join(project,'dist/plugin.js'),'utf8')
  const added = await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'qa-account.js'),file)
  const id = added.pluginId
  assert.ok(id,added.error)
  const list = () => page.evaluate(id=>window.ceruQa.plugins.accountConnections(id,'catalog'),id)
  const waitState = async predicate => {
    for (let attempt=0;attempt<100;attempt++) { const state=await list(); if (predicate(state)) return state; await delay(50) }
    throw Error('账号状态未更新：'+JSON.stringify(await list()))
  }
  const waitCount = count => waitState(state=>state.rows.length===count)
  const entry = page.locator('[data-plugin-account="plugin-account:'+id+':catalog"]')
  const menu = async () => { await page.locator('.user-capsule').hover(); await entry.waitFor() }
  const form = page.locator('.t-dialog').filter({hasText:'演示昵称'})
  const submit = async name => { await form.locator('input').fill(name); await form.getByRole('button',{name:'确定',exact:true}).click(); await form.waitFor({state:'hidden'}) }
  try {
    assert.equal((await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,true),id)).error,undefined)
    await menu(); await entry.click()
    try { await form.waitFor({timeout:2500}) } catch { throw Error('账号表单未出现：'+await page.locator('body').innerText()) }
    await form.getByRole('button',{name:'取消',exact:true}).click()
    await form.waitFor({state:'hidden'})
    assert.deepEqual(await list(),{active:null,rows:[]})
    await menu(); await entry.click(); await submit('甲'); await waitCount(1)
    const first = (await list()).active
    await menu(); await entry.hover(); await page.getByText('添加账号',{exact:true}).click(); await submit('乙'); await waitCount(2)
    const both = await list(); assert.deepEqual(both.rows.map(row=>row.summary.displayName),['甲','乙']); assert.notEqual(both.active,first)
    assert.ok(both.rows.every(row=>Object.keys(row).sort().join(',')==='id,summary'))
    await verifyAccountCollections(page,id,both.active)
    const guardManifest={manifestVersion:3,id:'qa.account-switch',name:'子账号切换验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'guard',name:'account.intercept',reason:'测试账号切换'}]}}
    const guardCode='exports.manifest='+JSON.stringify(guardManifest)+';exports.activate=ctx=>{ctx.hooks.on("account.switch",op=>op.preventDefault())}'
    const guard=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'account-switch.js'),guardCode);assert.ok(guard.pluginId,guard.error)
    const selectFirst=async()=>{await menu();await entry.hover();await page.locator('.n-dropdown-option').filter({hasText:/^甲$/}).click()}
    try {
      await page.evaluate(async id=>{await window.ceruQa.plugins.setEnabled(id,true);await window.ceruQa.plugins.savePermissions(id,['guard'])},guard.pluginId)
      await selectFirst();await page.getByText('插件已取消切换，仍使用原账号',{exact:true}).waitFor()
      assert.equal((await list()).active,both.active)
      assert.ok(await page.evaluate(()=>window.ceruQa.plugins.hookControls().then(state=>state.activity.some(row=>row.pluginId==='qa.account-switch' && row.name==='account.switch' && row.action==='cancel' && row.source==='ui'))))
      await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,[]),guard.pluginId)
      await selectFirst();await waitState(state=>state.active===first)
      console.log('Account switch: UI cancellation preserved current connection, recorded interceptor, and revocation restored switching')
    } finally {await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),guard.pluginId)}
    await waitState(state=>state.active===first)
    await page.evaluate(()=>{location.hash='/home/find'})
    const recommendations=page.locator('[data-account-collection="recommend"]')
    await recommendations.getByText('甲 · 今日推荐',{exact:true}).waitFor()
    assert.equal(await recommendations.getByText('乙 · 今日推荐',{exact:true}).count(),0)
    await page.evaluate(()=>{location.hash='/home/local'})
    await page.evaluate(async id=>{await window.ceruQa.plugins.setEnabled(id,false); await window.ceruQa.plugins.setEnabled(id,true)},id)
    assert.equal((await list()).active,first)
    await menu(); await entry.hover(); await page.getByText('退出当前账号',{exact:true}).click(); await waitCount(1)
    assert.equal((await list()).rows[0].summary.displayName,'乙')
    const root = join(profile,'plugins','accounts'), files = await readdir(root,{recursive:true})
    const records = files.filter(name=>name.endsWith('.bin')); assert.equal(records.length,1)
    assert.ok(!(await readFile(join(root,records[0]))).includes('local-demo:乙'))
    assert.ok(!(await readFile(join(root,files.find(name=>name.endsWith('connections.json'))),'utf8')).includes('local-demo:'))
  } finally { await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),id) }
  assert.equal((await readdir(join(profile,'plugins','accounts'))).length,0)
  console.log('Account menu: generated TS plugin, cancellation, two sign-ins, switch, restored selection, logout, encrypted records and uninstall passed')
  const fixture = {manifestVersion:3,id:'qa.account-expiry',name:'Expiry QA',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{accounts:[{id:'people',title:'续登验收',loginMethods:['form']}]}}
  const script = 'exports.manifest='+JSON.stringify(fixture)+';exports.activate=ctx=>{let serial=0; ctx.accounts.register("people",{login:async({auth})=>{const result=await auth.form({fields:[{key:"name",type:"text",label:"演示昵称"}]});return result?{credential:"fake-"+(++serial)}:null},profile:()=>({id:"one",displayName:"续登用户"}),validate:()=>({valid:serial>1})})}'
  const renewal = await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'renewal.js'),script)
  assert.ok(renewal.pluginId,renewal.error)
  try {
    const pluginId=renewal.pluginId, read=()=>page.evaluate(id=>window.ceruQa.plugins.accountConnections(id,'people'),pluginId)
    const row=page.locator('[data-plugin-account="plugin-account:'+pluginId+':people"]')
    await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,true),pluginId)
    await page.locator('.user-capsule').hover(); await row.click(); await submit('甲')
    const until = async predicate=>{for(let attempt=0;attempt<100;attempt++){const state=await read();if(predicate(state))return state;await delay(50)}throw Error('续登界面状态未恢复')}
    const signed=await until(state=>state.active)
    await page.locator('.user-capsule').hover(); await row.hover(); await page.getByText('续登用户 · 需要重新登录',{exact:true}).click(); await submit('甲')
    const renewed=await until(state=>state.active===signed.active && !state.rows[0].expired)
    assert.equal(renewed.rows.length,1)
    console.log('Account expiry: account menu validates, offers renewal, and retains the connection identity')
  } finally { await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),renewal.pluginId) }
}

async function verifyAccountCollections(page,pluginId,connectionId){
  const navigate=async path=>{await page.evaluate(path=>{location.hash=path},path)}
  const list=name=>page.locator('[data-account-collection="'+name+'"]')
  await navigate('/home/find');await list('recommend').getByText('乙 · 今日推荐',{exact:true}).waitFor()
  await navigate('/home/recent');await page.locator('[aria-label="历史来源"]').getByText('音乐库账号',{exact:true}).click()
  await list('history').getByText('乙 · 最近播放',{exact:true}).waitFor()
  await navigate('/home/songlist');await list('playlists').getByText('乙 · 我的歌单',{exact:true}).click()
  await page.getByText('乙 · 歌单歌曲',{exact:true}).first().waitFor()
  const original=(await page.evaluate(()=>window.ceruQa.songList.getFavoritesId())).data
  const favorite=await page.evaluate(()=>window.ceruQa.songList.create('QA 平台收藏','','local',{})),scratch=await page.evaluate(()=>window.ceruQa.songList.create('QA 同步歌曲','','local',{}))
  assert.ok(favorite.success && scratch.success,favorite.error || scratch.error)
  try{
    const manifestId=await page.evaluate(id=>window.ceruQa.plugins.contributions().then(rows=>rows.find(row=>row.pluginId===id).descriptor.id),pluginId)
    const inserted=await page.evaluate(([id,manifestId,connection])=>window.ceruQa.songList.addSongs(id,[{songmid:'demo-track',name:'同步测试歌曲',singer:'测试',source:'catalog',pluginResource:{kind:'track',pluginId:manifestId,providerId:'catalog',connectionId:connection,id:'demo-track'}}]),[scratch.data.id,manifestId,connectionId])
    assert.equal(inserted.data?.added,1,inserted.error)
    await page.evaluate(id=>window.ceruQa.songList.setFavoritesId(id),favorite.data.id)
    const detail=id=>'/home/list/'+encodeURIComponent(id)+'?type=local&source=local'
    await navigate(detail(favorite.data.id));await list('likes').getByText('乙 · 喜欢的歌曲',{exact:true}).waitFor()
    const toggle=list('likes').getByRole('switch',{name:'同步点赞'})
    assert.equal(await toggle.getAttribute('aria-checked'),'false');await toggle.focus();await toggle.press('Space')
    await page.waitForFunction(([id,connection])=>window.ceruQa.plugins.accountConnections(id,'catalog').then(state=>state.rows.find(row=>row.id===connection)?.syncLikes===true),[pluginId,connectionId])
    await navigate(detail(scratch.data.id));await page.getByText('同步测试歌曲',{exact:true}).first().waitFor()
    const like=page.locator('.like-btn').first();await like.click()
    await page.waitForFunction(id=>window.ceruQa.songList.getSongs(id).then(result=>result.data?.length===1),favorite.data.id)
    await like.click();await page.waitForFunction(id=>window.ceruQa.songList.getSongs(id).then(result=>result.data?.length===0),favorite.data.id)
    await navigate(detail(favorite.data.id));await list('likes').getByText('暂无内容',{exact:true}).waitFor()
    console.log('Account collections: generated plugin rendered four owner-bound lists, opened a platform playlist, and synchronized local like/remove into the selected account')
  }finally{
    await navigate('/home/local');if(original)await page.evaluate(id=>window.ceruQa.songList.setFavoritesId(id),original)
    await page.evaluate(async ids=>{for(const id of ids)await window.ceruQa.songList.delete(id)},[favorite.data.id,scratch.data.id])
  }
}
