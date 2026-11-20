import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

export async function verifyMusicSourceSelection(page, restart) {
  const fixture = await readFile(new URL('../src/main/services/plugin/v3/__fixtures__/source-project.js',import.meta.url),'utf8')
  const installed = []
  const add = async (code,file) => {
    const {pluginId,error} = await page.evaluate(([code,file]) => window.ceruQa.plugins.addPlugin(code,file),[code,file])
    assert.ok(pluginId,error)
    installed.push(pluginId)
    assert.equal((await page.evaluate(id => window.ceruQa.plugins.setEnabled(id,true),pluginId)).error,undefined)
    return pluginId
  }
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('ceru-music-pending:userInfo') ?? localStorage.getItem('userInfo') ?? '{}'))
  const selector = page.getByRole('button',{name:'选择音源',exact:true}), dropdown = page.locator('.source-list')
  const go = path => page.evaluate(path => {location.hash=path},path)
  const mounts = ['sidebar','settings','home-tab','playlist-section']
  const title = mount => '音源页面 ' + mount
  const rulePages = [
    ['function',{predicate:'decide'}],['all',{selectedSource:'catalog',predicate:'decide'}],
    ['any',{selectedSource:'local',predicate:'decide',combine:'any'}],
    ['override-show',{selectedSource:'missing',predicate:'decide'}],
    ['override-hide',{selectedSource:'catalog',predicate:'decide',combine:'any'}],
    ['invalid',{selectedSource:'catalog',predicate:'decide',combine:'any'}]
  ].map(([id,when]) => ({id,title:'规则 '+id,view:'panel',mount:'sidebar',when}))
  const manifest = {
    manifestVersion:3,id:'test.source-pages',name:'音源页面验收',version:'1.0.0',
    engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},
    entry:{logic:{module:'logic.main'},views:[{id:'panel',kind:'native',module:'render'}]},
    provides:{actions:[{id:'render',title:'渲染'},{id:'decide',title:'入口判断'},{id:'change',title:'切换演示凭据状态'}]},
    ui:{pages:[...rulePages,...mounts.map(mount => ({id:mount,title:title(mount),view:'panel',mount,when:{selectedSource:'catalog'}})),
      {id:'connection',title:'测试连接入口',view:'panel',mount:'sidebar',when:{predicate:'decide'}},
      {id:'login',title:'独立登录入口',view:'panel',mount:'settings'}]}
  }
  const checkMounts = async visible => {
    const state = visible ? 'visible' : 'detached'
    await page.locator('.sidebar .nav-section').getByText(title('sidebar'),{exact:true}).waitFor({state})
    const rule = id => page.locator('.sidebar .nav-section').getByText('规则 '+id,{exact:true})
    await rule('any').waitFor()
    await rule('override-show').waitFor()
    for (const id of ['function','all']) await rule(id).waitFor({state})
    for (const id of ['override-hide','invalid']) await rule(id).waitFor({state:'detached'})
    await go('/settings')
    const nav = page.locator('.nav-group')
    await nav.getByText('独立登录入口',{exact:true}).waitFor()
    const settings = nav.getByText(title('settings'),{exact:true})
    await settings.waitFor({state})
    if (visible) {
      await settings.click()
      await page.locator('.section-container .plugin-page').getByRole('heading',{name:'条件页已渲染'}).waitFor()
    }
    await go('/home/find')
    await page.waitForFunction(() => location.hash.includes('/home/find') && !document.querySelector('.section-container'))
    const tab = page.locator('.find-tabs').getByText(title('home-tab'),{exact:true})
    await tab.waitFor({state})
    if (visible) {
      await tab.click()
      await page.locator('.find-tabs .plugin-page').getByRole('heading',{name:'条件页已渲染'}).waitFor()
    }
    await go('/home/songlist')
    await page.waitForFunction(() => location.hash.includes('/home/songlist') && !document.querySelector('.find-tabs'))
    const region = page.locator(`.plugin-playlist-sections .plugin-playlist-section[aria-label="${title('playlist-section')}"]`)
    await region.waitFor({state})
    if (visible) await region.getByRole('heading',{name:'条件页已渲染'}).waitFor()
    await go('/home/local')
  }
  try {
    const owner = await add(fixture,'first-source.js')
    await selector.click()
    await dropdown.getByRole('button').filter({hasText:/本地/}).click()
    await add('exports.manifest='+JSON.stringify(manifest)+`;exports.activate=async ctx=>{
      let connected=false;
      let last=null; ctx.events.on('entries.selectionChanged',value=>{last=value});
      const initial=await ctx.entries.selection();
      ctx.actions.register('render',async()=>({type:'page',title:'条件页已渲染',description:JSON.stringify({initial,last,current:await ctx.entries.selection()}),sections:[],actions:[{label:'切换演示凭据状态',action:'change'}]}));
      ctx.actions.register('change',async()=>{connected=!connected;await ctx.entries.invalidate();return null});
      ctx.actions.register('decide',({pageId,selectedSource,selectedProvider})=>{
        if(pageId==='connection')return connected;
        if(pageId==='override-hide')return 'force-hide'; if(pageId==='override-show')return 'force-show';
        if(pageId==='invalid')return {};return selectedSource==='catalog' && selectedProvider==='local.source-project';
      });}`,'source-pages.js')
    await selector.press('Enter')
    await dropdown.getByRole('button',{name:'source-project',exact:true}).waitFor()
    await dropdown.locator('button[aria-label="source-project"]:enabled').waitFor()
    await dropdown.getByRole('button',{name:'source-project',exact:true}).press('Enter')
    await dropdown.waitFor({state:'detached'})
    assert.equal((await saved()).selectSources,'catalog')
    await checkMounts(true)
    const connection = page.locator('.sidebar .nav-section').getByText('测试连接入口',{exact:true})
    await go('/settings')
    await page.locator('.nav-group').getByText('独立登录入口',{exact:true}).click()
    const change = page.locator('.section-container .plugin-page').getByRole('button',{name:'切换演示凭据状态',exact:true})
    await change.waitFor()
    const readReport = async () => JSON.parse(await page.locator('.section-container .plugin-page p').filter({hasText:'"initial"'}).innerText())
    const catalog = {selectedSource:'catalog',selectedProvider:'local.source-project'}
    assert.deepEqual(await readReport(), {initial:{selectedSource:'local',selectedProvider:null},last:catalog,current:catalog})
    assert.equal(await connection.count(),0)
    await change.click(); await go('/home/local'); await connection.waitFor()
    await connection.click()
    await page.locator('.plugin-page').getByRole('button',{name:'切换演示凭据状态',exact:true}).click()
    await connection.waitFor({state:'detached'})
    await page.waitForFunction(() => location.hash.includes('/home/local'))
    assert.equal((await saved()).selectSources,'catalog')
    console.log('Plugin-requested visibility recalculation showed the owner page and removed it while open, without changing the music source.')
    await page.locator('.sidebar .nav-section').getByText(title('sidebar'),{exact:true}).click()
    await page.locator('.plugin-page').getByRole('heading',{name:'条件页已渲染'}).waitFor()
    await selector.press('Enter')
    const localOption = dropdown.getByRole('button').filter({hasText:/本地/})
    await localOption.press('Enter')
    await dropdown.waitFor({state:'detached'})
    await page.waitForFunction(() => location.hash.includes('/home/local'))
    await checkMounts(false)
    await selector.press('Enter')
    assert.equal(await localOption.getAttribute('aria-pressed'),'true')
    await dropdown.getByRole('button',{name:'source-project',exact:true}).press('Enter')
    await dropdown.waitFor({state:'detached'})
    assert.equal((await saved()).selectSources,'catalog',JSON.stringify(await page.evaluate(() => ({route:location.hash,keys:Object.keys(localStorage),version:localStorage.getItem('ceru-music-data-version'),dialogs:[...document.querySelectorAll('[role="dialog"]')].map(node => node.textContent?.slice(0,90))}))))
    const second = await add(fixture.replaceAll('source-project','second-source'),'second-source.js')
    await page.waitForFunction(() => window.ceruQa.plugins.contributions().then(rows => rows.filter(row => row.enabled && row.descriptor.providers.some(provider => provider.id === 'catalog')).length === 2))
    await go('/settings?category=music')
    const cards = page.locator('#music-source'), current = cards.getByRole('button',{name:'source-project',exact:true})
    await current.waitFor()
    assert.equal(await current.getAttribute('aria-pressed'),'true')
    await page.getByRole('heading',{name:'平台实现'}).waitFor()
    assert.equal((await saved()).sourcePluginMap.catalog,owner)
    const implementations = page.locator('.setting-group').filter({has:page.getByRole('heading',{name:'平台实现'})})
    for (const [label,implementationId] of [['second-source',second],['source-project',owner]]) {
      await implementations.locator('.t-input').click()
      await page.locator('.t-popup:visible').getByText(label,{exact:true}).click()
      await cards.getByRole('button',{name:label,exact:true}).waitFor()
      assert.equal((await saved()).selectSources,'catalog')
      assert.equal((await saved()).sourcePluginMap.catalog,implementationId)
    }
    const local = cards.getByRole('button').filter({hasText:/本地/})
    await local.press('Space')
    assert.equal((await saved()).selectSources,'local')
    await go('/home/local')
    await selector.click()
    assert.equal(await dropdown.getByRole('button').filter({hasText:/本地/}).getAttribute('aria-pressed'),'true')
    await dropdown.getByRole('button',{name:'source-project',exact:true}).click()
    await page.reload({waitUntil:'domcontentloaded'})
    await selector.click()
    const restored = dropdown.getByRole('button',{name:'source-project',exact:true})
    await restored.waitFor()
    assert.equal(await restored.getAttribute('aria-pressed'),'true')
    assert.equal((await saved()).sourcePluginMap.catalog,owner)
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('audio')].some(audio => !audio.paused)),false)
    const toggle = async (id, enabled) => assert.equal((await page.evaluate(([id, enabled]) => window.ceruQa.plugins.setEnabled(id, enabled), [id, enabled])).error, undefined)
    await toggle(owner, false)
    const remaining = dropdown.getByRole('button',{name:'second-source',exact:true})
    await remaining.waitFor()
    assert.equal((await saved()).selectSources,'local','Losing the selected provider must not select its sibling')
    assert.equal((await saved()).sourcePluginMap.catalog,owner,'Disabling a provider must retain the user preference')
    assert.equal(await remaining.getAttribute('aria-pressed'),'false')
    await toggle(owner, true)
    await restored.waitFor()
    assert.equal((await saved()).selectSources,'local','Restoring a provider must not reclaim the selection')
    await toggle(owner, false)
    await remaining.click()
    assert.equal((await saved()).selectSources,'catalog')
    assert.equal((await saved()).sourcePluginMap.catalog,second,'Explicit selection must choose the displayed provider')
    await toggle(owner, true)
    await selector.click()
    await remaining.waitFor()
    assert.equal(await remaining.getAttribute('aria-pressed'),'true')
    await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id),second)
    installed.splice(installed.indexOf(second),1)
    await restored.waitFor()
    assert.equal((await saved()).selectSources,'local','Uninstall must fall back instead of impersonating the removed provider')
    await restored.click()
    assert.equal((await saved()).sourcePluginMap.catalog,owner)
    const reason = '请先连接测试账户'
    for (const [name,decision] of [['blocked-source',{state:'disabled',reason}],['silent-source',{state:'disabled'}],['hidden-source',false]]) {
      await add(fixture.replaceAll('source-project',name)
        .replace('connectionMode: "none"','when: {predicate: "check"}, connectionMode: "none"')
        .replace('actions: [','actions: [{id:"check",title:"检查"},')
        .replace('ctx.providers.register("catalog",',`ctx.actions.register("check",()=>(${JSON.stringify(decision)}));ctx.providers.register("catalog",`),name+'.js')
    }
    const verifyDisabled = async picker => {
      const blocked = picker.getByRole('button',{name:'blocked-source',exact:true})
      const silent = picker.getByRole('button',{name:'silent-source',exact:true})
      const hint = page.locator('.n-tooltip').filter({hasText:reason})
      await silent.waitFor()
      assert.equal(await blocked.getAttribute('aria-disabled'),'true')
      assert.equal(await silent.getAttribute('aria-disabled'),'true')
      assert.equal(await picker.getByRole('button',{name:'hidden-source'}).count(),0)
      assert.equal(await picker.getByText(reason).count(),0)
      await blocked.hover(); await hint.waitFor()
      await silent.hover(); await hint.waitFor({state:'hidden'})
      assert.equal(await page.locator('.n-tooltip:visible').count(),0)
      await blocked.focus(); await blocked.press('Shift+Tab'); await page.keyboard.press('Tab')
      await hint.waitFor()
      await blocked.press('Enter'); await blocked.press('Space')
      await blocked.click({force:true}); await blocked.press('Tab'); await silent.hover()
      await hint.waitFor({state:'hidden'})
      assert.equal(await picker.isVisible(),true)
      assert.equal((await saved()).selectSources,'catalog')
      assert.equal((await saved()).sourcePluginMap.catalog,owner)
    }
    await selector.click(); await verifyDisabled(dropdown)
    await page.locator('.source-mask').click({position:{x:1,y:1}})
    await dropdown.waitFor({state:'detached'})
    await go('/settings?category=music'); await verifyDisabled(cards)
    assert.equal(await page.getByRole('heading',{name:'平台实现'}).count(),0)
    console.log('Disabled source hints passed in search and settings: native hover/focus tooltip, silent disablement, hidden entry, unchanged selection.')
    const gateManifest = {manifestVersion:3,id:'test.selection-login',name:'切换登录测试',version:'1.0.0',
      engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},
      uses:{permissions:[{name:'player.read',key:'listen',reason:'测试撤权取消'}]},provides:{
        accounts:[{id:'people',title:'测试账号',providers:['gate'],loginMethods:['form']}],
        actions:[{id:'enter',title:'切入判断'}],providers:[{id:'gate',name:'登录测试源',protocols:['music.search@1'],beforeSelect:'enter'}]}}
    const gate = await add('exports.manifest='+JSON.stringify(gateManifest)+`;exports.activate=ctx=>{
      let active=false;
      ctx.providers.register('gate',{tracks:{search:async()=>({items:[]})}});
      ctx.accounts.register('people',{login:async({auth})=>{const value=await auth.form({fields:[{key:'name',label:'测试昵称',type:'text'}]});return value?{credential:'fixture'}:null},profile:()=>({id:'fixture',displayName:'测试账户'})});
      ctx.events.on('account.changed',value=>{active=!!value.connectionId});
      ctx.actions.register('enter',()=>active || {login:{accountId:'people',method:'form'}});
    }`,'selection-login.js')
    const gateButton = picker => picker.getByRole('button',{name:'登录测试源',exact:true})
    const form = page.locator('.t-dialog').filter({hasText:'测试昵称'})
    const account = () => page.evaluate(id=>window.ceruQa.plugins.accountConnections(id,'people'),gate)
    await gateButton(cards).click(); await form.waitFor()
    assert.equal((await saved()).selectSources,'catalog')
    await form.getByRole('button',{name:'取消',exact:true}).click(); await form.waitFor({state:'hidden'})
    assert.equal((await saved()).selectSources,'catalog'); assert.deepEqual((await account()).rows,[])
    await gateButton(cards).click(); await form.waitFor()
    await local.click(); await form.waitFor({state:'hidden'})
    assert.equal((await saved()).selectSources,'local'); assert.deepEqual((await account()).rows,[])
    await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['listen']),gate)
    await gateButton(cards).click(); await form.waitFor()
    await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,[]),gate)
    await form.waitFor({state:'hidden'}); assert.equal((await saved()).selectSources,'local')
    await gateButton(cards).click(); await form.waitFor()
    await toggle(gate,false); await form.waitFor({state:'hidden'})
    await toggle(gate,true); assert.equal((await saved()).selectSources,'local'); assert.deepEqual((await account()).rows,[])
    await go('/home/local'); await selector.click(); await gateButton(dropdown).click(); await form.waitFor()
    await form.locator('input').fill('测试'); await form.getByRole('button',{name:'确定',exact:true}).click()
    await form.waitFor({state:'hidden'}); await dropdown.waitFor({state:'detached'})
    await go('/settings?category=music')
    await cards.locator('button[aria-label="登录测试源"][aria-pressed="true"]').waitFor()
    assert.equal((await saved()).selectSources,'gate'); assert.equal((await account()).rows.length,1)
    await local.click(); await cards.locator('button[aria-pressed="true"]').filter({hasText:/本地/}).waitFor(); await gateButton(cards).click()
    await cards.locator('button[aria-label="登录测试源"][aria-pressed="true"]').waitFor(); assert.equal(await form.isVisible(),false)
    await cards.getByRole('button',{name:'source-project',exact:true}).click()
    assert.equal((await saved()).selectSources,'catalog')
    console.log('Provider selection login: cancel, alternate choice, revoke, disable, successful login and existing account passed across both pickers.')
    if (restart) {
      page = await restart()
      await page.waitForFunction(() => !!document.querySelector('.user-capsule'),undefined,{timeout:45000})
      await go('/settings')
      try { await page.locator('.nav-group').getByText('独立登录入口',{exact:true}).click() }
      catch(error) { console.error('Restart route:',await page.evaluate(() => ({route:location.hash,visible:document.body.innerText.slice(0,900)}))); throw error }
      await page.locator('.section-container .plugin-page').getByRole('heading',{name:'条件页已渲染'}).waitFor()
      const report = await readReport()
      assert.deepEqual(report.initial,catalog)
      assert.deepEqual(report.current,catalog)
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('audio')].some(audio => !audio.paused)),false)
      console.log('Fresh Electron process: selection read during plugin activation matched the saved platform and public provider ID before playback.')
    }
    console.log('Duplicate providers: disable and uninstall fell back to local; restore did not reclaim focus; only explicit reselection changed the saved implementation.')
    console.log('Source selection: both keyboard-accessible pickers, persisted selection after reload, and original provider preference with duplicate registration passed without playback.')
  } finally {
    if (!page.isClosed() && await page.evaluate(() => !!window.ceruQa)) for (const pluginId of installed.reverse()) await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id),pluginId)
  }
}
