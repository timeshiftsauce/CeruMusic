import assert from 'node:assert/strict'
import { readFile, readdir, unlink, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export async function verifyNeteaseHostAccounts(page,restart,artifact,directory) {
  await writeFile(join(directory,'netease-qa-login'),'first')
  const added=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'netease-host-account.js'),await readFile(artifact,'utf8'))
  assert.ok(added.pluginId,added.error)
  const id=added.pluginId, list=()=>page.evaluate(id=>window.ceruQa.plugins.accountConnections(id,'netease'),id)
  const until=async predicate=>{for(let attempt=0;attempt<150;attempt++){const state=await list();if(predicate(state))return state;await delay(100)}throw Error('账号状态未更新：'+JSON.stringify(await list())+' '+(await page.locator('body').innerText()).slice(-350))}
  const menu=async()=>{await page.mouse.move(0,0);await page.locator('.user-capsule').hover();const entry=page.locator('[data-plugin-account="plugin-account:'+id+':netease"]');await entry.waitFor();return entry}
  const submenu=async text=>{const entry=await menu();await entry.hover();await page.locator('.n-dropdown-option').filter({hasText:new RegExp('^'+text+'$')}).click()}
  const tab=()=>page.locator('.find-tabs .n-tabs-nav').getByText('网易云推荐',{exact:true})
  const show=async name=>{
    // Restoration briefly publishes an inventory before route availability settles.
    // Use the same ready discovery entry a user would click after a cold start.
    const discovery=page.locator('.sidebar .nav-section').getByRole('button',{name:/发现/})
    await discovery.waitFor();await discovery.click();await tab().click()
    await page.locator('.find-tabs .plugin-page').getByText(name+' 推荐歌曲',{exact:true}).waitFor()
  }
  try {
    await page.evaluate(async id=>{await window.ceruQa.plugins.setEnabled(id,true);await window.ceruQa.plugins.savePermissions(id,['netease.network'])},id)
    await page.getByRole('button',{name:'选择音源',exact:true}).click();await page.locator('.source-list').getByRole('button',{name:'网易云（账号）'}).click()
    assert.equal((await list()).rows.length,0)
    const consent=()=>page.locator('.t-dialog:visible').filter({has:page.locator('.grant-body')})
    await (await menu()).click()
    await consent().getByText('使用所选账号访问网易云音乐接口',{exact:true}).waitFor()
    await consent().getByRole('button',{name:'取消',exact:true}).click()
    await consent().waitFor({state:'hidden'})
    assert.equal(await page.locator('.qr-login:visible').count(),0)
    assert.equal((await list()).rows.length,0)
    // The dialog hides before the rejected RPC finishes. Reset grants only once
    // that login has returned, so the next attempt cannot join its old prompt.
    await page.locator('.t-message').filter({hasText:'插件未能完成账号登录'}).waitFor()
    await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['netease.network']),id)
    await writeFile(join(directory,'netease-qa-qr-state'),'waiting')
    await (await menu()).click()
    await consent().getByRole('button',{name:'允许',exact:true}).click()
    const qr=page.locator('.t-dialog:visible').filter({has:page.locator('.qr-login')})
    await qr.getByText('等待扫码',{exact:true}).waitFor()
    await qr.locator('.qr-logo img').waitFor()
    await page.waitForFunction(()=>{const image=document.querySelector('.qr-logo img');return image?.complete && image.naturalWidth>0})
    await page.mouse.move(0,0)
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('.t-message')).some(element=>element.getBoundingClientRect().height>0))
    await page.waitForFunction(()=>{
      const frame=document.querySelector('.qr-frame'),canvas=frame?.querySelector('canvas')
      return !!canvas && Math.abs(canvas.getBoundingClientRect().width-208)<0.01 && Math.abs(frame.getBoundingClientRect().width-240)<0.01
    })
    const qaOutput=join(import.meta.dirname,'../dist/plugin-upgrade-local-2.5.0/qa')
    await mkdir(qaOutput,{recursive:true})
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme)
      await qr.evaluate(async element=>{
        await Promise.all(element.getAnimations({subtree:true}).filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})))
      })
      const boxes=await qr.locator('.qr-frame').evaluate(frame=>{
        const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}
        return {frame:rect(frame),canvas:rect(frame.querySelector('canvas')),dialog:rect(frame.closest('.t-dialog'))}
      })
      assert.ok(Math.abs(boxes.canvas.width-208)<0.1);assert.ok(Math.abs(boxes.canvas.height-208)<0.1)
      assert.ok(Math.abs(boxes.frame.width-240)<0.1);assert.ok(Math.abs(boxes.frame.height-240)<0.1)
      assert.ok(Math.abs(boxes.canvas.x-boxes.frame.x-16)<=1)
      assert.ok(Math.abs(boxes.canvas.y-boxes.frame.y-16)<=1)
      assert.ok(Math.abs(boxes.frame.x+120-boxes.dialog.x-boxes.dialog.width/2)<=1)
      const brand=await qr.locator('.qr-title').evaluate(header=>{
        const icon=header.querySelector('.qr-logo').getBoundingClientRect(),title=header.querySelector('span:last-child').getBoundingClientRect()
        return {width:icon.width,height:icon.height,gap:title.left-icon.right,offset:icon.y+icon.height/2-title.y-title.height/2}
      })
      assert.equal(brand.width,26);assert.equal(brand.height,26);assert.equal(brand.gap,10);assert.ok(Math.abs(brand.offset)<=1)
      await qr.screenshot({path:join(qaOutput,'netease-qr-'+theme+'.png')})
    }
    await writeFile(join(directory,'netease-qa-qr-state'),'scanned')
    await qr.getByText('已扫码，请在手机上确认',{exact:true}).waitFor()
    await writeFile(join(directory,'netease-qa-qr-state'),'done')
    const first=(await until(state=>state.rows.length===1)).active
    await qr.waitFor({state:'hidden'})
    await unlink(join(directory,'netease-qa-qr-state'))
    await show('first')
    await writeFile(join(directory,'netease-qa-login'),'second');await submenu('添加账号')
    const second=(await until(state=>state.rows.length===2)).active;assert.notEqual(first,second)
    await show('second');assert.equal(await page.locator('.find-tabs .plugin-page').getByText('first 推荐歌曲',{exact:true}).count(),0)
    const root=join(directory,'profile','plugins','accounts'),files=await readdir(root,{recursive:true})
    const encrypted=files.filter(file=>file.endsWith('.bin'));assert.equal(encrypted.length,2)
    for(const file of files.filter(file=>file.endsWith('.bin') || file.endsWith('.json'))) assert.equal((await readFile(join(root,file))).includes('qa-vault-'),false)
    page=await restart();await page.locator('.user-capsule').waitFor();await show('second');assert.equal((await list()).active,second)
    assert.equal(await page.evaluate(()=>Array.from(document.querySelectorAll('audio')).some(audio=>!audio.paused)),false)
    await writeFile(join(directory,'netease-qa-expired-second'),'expired')
    await page.locator('.find-tabs .plugin-page').getByRole('button',{name:'刷新',exact:true}).click()
    await until(state=>state.rows.some(row=>row.id===second && row.expired));await tab().waitFor({state:'detached'})
    await unlink(join(directory,'netease-qa-expired-second'));await submenu('测试乙 · 需要重新登录')
    await until(state=>state.active===second && state.rows.length===2 && !state.rows.find(row=>row.id===second).expired)
    await show('second');await submenu('测试甲');await until(state=>state.active===first);await show('first')
    await submenu('退出当前账号');await until(state=>state.active===second && state.rows.length===1);await show('second')
    await page.evaluate(()=>{location.hash='/settings'})
    await page.locator('.nav-group').getByText('网易云账号',{exact:true}).click()
    await page.locator('.native-settings-card').getByText('测试乙 · FREE',{exact:true}).waitFor()
    await page.locator('.find-tabs').waitFor({state:'detached'})
    assert.equal(await page.locator('.content-panel').getByRole('heading',{name:'网易云账号',exact:true}).count(),1)
    await page.locator('.content-panel').screenshot({path:join(qaOutput,'netease-account-settings.png')})
    console.log('NetEase host accounts: credential consent denied before QR and granted before login; light/dark provider logo, QR quiet zone and centering; one settings title; two QR logins, distinct recommendations, cold restore, expiry eviction, same-ID renewal, switch, logout and encrypted account files passed (fixture HTTP).')
  } finally {if(!page.isClosed() && await page.evaluate(()=>!!window.ceruQa))await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),id)}
}

export async function verifyNeteaseDaily(page,restart,artifact,directory) {
  const code = await readFile(artifact,'utf8')
  const added = await page.evaluate(code => window.ceruQa.plugins.addPlugin(code,'netease-v3.js'),code)
  assert.ok(added.pluginId,added.error)
  const go = async path => { await page.evaluate(path => {location.hash=path},path); await page.waitForFunction(path => location.hash==='#'+path,path) }
  const tab = () => page.locator('.find-tabs .n-tabs-nav').getByText('网易云推荐',{exact:true})
  const settings = () => page.locator('.nav-group').getByText('网易云账号',{exact:true})
  const choose = async name => {
    await page.getByRole('button',{name:'选择音源',exact:true}).click()
    await page.locator('.source-list').getByRole('button',{name}).click()
    await page.locator('.source-list').waitFor({state:'detached'})
  }
  const selected = () => page.evaluate(() => JSON.parse(localStorage.getItem('ceru-music-pending:userInfo') ?? localStorage.getItem('userInfo') ?? '{}').selectSources)
  const waitResponse = async name => {
    const until = Date.now()+25000
    while (Date.now()<until) {
      try { await readFile(join(directory,name)); return } catch (error) { if (error.code!=='ENOENT') throw error }
      await delay(100)
    }
    throw Error('未收到模拟平台请求：'+name+'；当前页面：'+(await page.locator('body').innerText()).slice(-350))
  }
  try {
    assert.equal((await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,true),added.pluginId)).error,undefined)
    await choose(/本地/); await go('/home/find'); assert.equal(await tab().count(),0)
    await choose('网易云（账号）'); assert.equal(await selected(),'wy'); assert.equal(await tab().count(),0)
    await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['netease.network']),added.pluginId)
    await go('/settings'); await settings().click()
    await waitResponse('netease-test-scanned')
    await go('/home/find'); await tab().click(); await page.locator('.find-tabs .plugin-page').getByText('离线推荐歌曲',{exact:true}).waitFor()
    await choose(/本地/); await tab().waitFor({state:'detached'}); await page.waitForFunction(()=>location.hash==='#/home/local')
    await choose('网易云（账号）'); const discovery = () => page.locator('.sidebar .nav-section').getByRole('button',{name:/发现/})
    await discovery().waitFor(); assert.equal(await page.evaluate(()=>location.hash),'#/home/local'); await discovery().click(); await tab().waitFor()
    page = await restart(); await page.locator('.user-capsule').waitFor(); await discovery().waitFor(); await discovery().click(); await tab().waitFor(); assert.equal(await selected(),'wy')
    assert.equal(await page.evaluate(()=>Array.from(document.querySelectorAll('audio')).some(audio=>!audio.paused)),false)
    await writeFile(join(directory,'netease-test-expired'),'expired',{flag:'wx'})
    page = await restart(); await page.locator('.user-capsule').waitFor(); await waitResponse('netease-test-validated-expiry')
    await go('/settings'); await settings().waitFor()
    await go('/home/find'); assert.equal(await tab().count(),0); assert.equal(await selected(),'wy')
    await unlink(join(directory,'netease-test-expired')); await unlink(join(directory,'netease-test-scanned'))
    await go('/settings'); await settings().click(); await waitResponse('netease-test-scanned')
    await go('/home/find'); await tab().click()
    const content = page.locator('.find-tabs .plugin-page')
    await content.getByText('离线推荐歌曲',{exact:true}).waitFor()
    await writeFile(join(directory,'netease-test-recommend-expired'),'expired',{flag:'wx'})
    await content.getByRole('button',{name:'刷新',exact:true}).click()
    await waitResponse('netease-test-recommend-rejected'); await tab().waitFor({state:'detached'})
    assert.equal(await content.getByText('离线推荐歌曲',{exact:true}).count(),0)
    assert.equal(await selected(),'wy'); await go('/settings'); await settings().waitFor()
    console.log('NetEase v3 daily: actual account view and native recommendations, source switching, no-playback cold restore, expired cold session and active tab eviction passed (fixture HTTP).')
  } finally {
    if (!page.isClosed() && await page.evaluate(()=>!!window.ceruQa)) await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),added.pluginId)
  }
}
