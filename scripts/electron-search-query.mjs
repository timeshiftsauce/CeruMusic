import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

export async function verifySearchQuery(page) {
  const add = async (code,file) => {
    const result = await page.evaluate(([code,file]) => window.ceruQa.plugins.addPlugin(code,file),[code,file])
    assert.ok(result.pluginId,result.error)
    const enabled = await page.evaluate(id => window.ceruQa.plugins.setEnabled(id,true),result.pluginId)
    assert.equal(enabled.error,undefined)
    return result.pluginId
  }
  const addHook = (id,handler) => {
    const manifest = {manifestVersion:3,id,name:id,version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'query',name:'search.intercept',reason:'测试搜索改写'}]}}
    return add('exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{ctx.hooks.on("search.query",'+handler+')}',id+'.js')
  }
  const grant = (id,allowed) => page.evaluate(([id,allowed])=>window.ceruQa.plugins.savePermissions(id,allowed?['query']:[]),[id,allowed])
  await add(await readFile(new URL('../src/main/services/plugin/v3/__fixtures__/source-project.js',import.meta.url),'utf8'),'catalog.js')
  await page.getByRole('button',{name:'选择音源',exact:true}).click()
  await page.locator('.source-list').getByRole('button',{name:'source-project',exact:true}).click()
  const first = await addHook('test.search-first','async (op,next)=>{if(op.input.query==="cancel")op.preventDefault();else if(op.input.query==="alias")await next({...op.input,query:"morning"})}')
  const second = await addHook('test.search-second','op=>{if(op.input.query==="morning")return {...op.input,query:"rain"}}')
  await grant(first,true); await grant(second,true)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(row=>row.names.includes('search.query')))
  const field = page.locator('.search-field input'), results = page.locator('.search-container')
  const submit = async query => {await field.fill(query); await field.press('Enter')}
  await submit('alias')
  await results.getByText('Rainy Afternoon',{exact:true}).waitFor()
  await field.fill('draft'); await field.blur()
  await results.getByText('Rainy Afternoon',{exact:true}).waitFor()
  await grant(second,false)
  await submit('alias')
  await results.getByText('Morning Light',{exact:true}).waitFor()
  await submit('cancel')
  await results.locator('.keyword').getByText('cancel',{exact:true}).waitFor()
  await page.waitForFunction(()=>window.ceruQa.plugins.hookControls().then(state=>state.activity.some(row=>row.name==='search.query' && row.action==='cancel')))
  assert.equal(await results.getByText('Morning Light',{exact:true}).count(),0)
  await grant(first,false)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(row=>!row.names.includes('search.query')))
  await submit('night'); await results.getByText('Night Walk',{exact:true}).waitFor()
  const base={manifestVersion:3,version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}}}
  const provider={...base,id:'test.suggestions',name:'Suggestion provider',provides:{providers:[{id:'tips',name:'Suggestion provider',connectionMode:'none',protocols:['music.search@1','music.suggest@1']}]}}
  await add('exports.manifest='+JSON.stringify(provider)+`;exports.activate=ctx=>ctx.providers.register('tips',{tracks:{
    suggest:async query=>[query+' first',query+' second'],
    search:async request=>({items:[{ref:{pluginId:ctx.plugin.id,providerId:'tips',kind:'track',id:'tip'},title:request.query,metadata:{artists:['test']}}]})
  }})`,'tips.js')
  const rewriter={...base,id:'test.suggestion-order',name:'Suggestion order',uses:{permissions:[{key:'query',name:'search.intercept',reason:'测试建议排序'}]}}
  const hook=await add('exports.manifest='+JSON.stringify(rewriter)+`;exports.activate=ctx=>ctx.hooks.on('search.suggest',async(op,next)=>{
    if(op.input.query==='slow'){await new Promise(resolve=>setTimeout(resolve,650))}
    await next({...op.input,items:[...op.input.items].reverse()})
  })`,'suggest.js')
  await page.getByRole('button',{name:'选择音源',exact:true}).click()
  await page.locator('.source-list').getByRole('button',{name:'Suggestion provider',exact:true}).click()
  const tips=page.locator('.all-suggest .suggest-item .name')
  const expectTips=async names=>{
    await page.waitForFunction(names=>JSON.stringify([...document.querySelectorAll('.all-suggest .suggest-item .name')].map(node=>node.textContent.trim()))===JSON.stringify(names),names,{timeout:7000})
  }
  await field.fill('seed');await expectTips(['seed first','seed second'])
  await grant(hook,true)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(row=>row.names.includes('search.suggest')))
  await field.fill('slow');await page.waitForTimeout(400);await field.fill('fast')
  await expectTips(['fast second','fast first']);await page.waitForTimeout(800)
  assert.deepEqual(await tips.allTextContents(),['fast second','fast first'])
  await tips.first().click();await results.getByText('fast second',{exact:true}).filter({visible:true}).last().waitFor()
  await field.fill('');await field.focus()
  await page.locator('.search-history .history-item').getByText('fast second',{exact:true}).waitFor()
  assert.equal(await tips.count(),0)
  await grant(hook,false)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(row=>!row.names.includes('search.suggest')))
  await field.fill('plain');await expectTips(['plain first','plain second'])
  const pager={...base,id:'test.result-pages',name:'Result pages',provides:{providers:[{id:'paged',name:'Result pages',connectionMode:'none',protocols:['music.search@1','playlists.search@1']}]}}
  await add('exports.manifest='+JSON.stringify(pager)+`;exports.activate=ctx=>{
    const search=kind=>async request=>{
      const token='second-'+kind;
      const titles=request.query==='scroll-pages'
        ? request.cursor===undefined?Array.from({length:30},(_,i)=>'row '+i):['reached bottom']
        : request.cursor===undefined?['skip']:request.cursor===token?['one','two']:['wrong cursor'];
      return {items:titles.map(title=>({title,ref:{pluginId:ctx.plugin.id,kind,providerId:'paged',id:title,data:{fixture:'private-payload'}},metadata:{artists:['test']},capabilities:[]})),...(request.cursor===undefined?{nextCursor:token}:{})}
    };ctx.providers.register('paged',{tracks:{search:search('track')},playlists:{search:search('playlist')}})
  }`,'paged.js')
  const resultManifest={...rewriter,id:'test.result-order',name:'Result order'}
  const resultHook=await add('exports.manifest='+JSON.stringify(resultManifest)+`;exports.activate=ctx=>ctx.hooks.on('search.results',op=>{
    const page=op.input.page,items=page.items;if(items.some(row=>row.ref.providerId!=='private') || JSON.stringify(op.input).includes('private-payload') || page.nextCursor)throw Error('Unexpected private data');
    if(items.some(row=>row.title==='skip'))return {...op.input,page:{...page,items:[]}};
    return {...op.input,page:{...page,items:[...items].reverse().concat({ref:{kind:page.kind,providerId:'paged',id:'extra'},title:'merged',metadata:{artists:['test']}})}}
  })`,'result-order.js')
  await grant(resultHook,true)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(row=>row.names.includes('search.results')))
  await field.blur()
  await page.getByRole('button',{name:'选择音源',exact:true}).click()
  await page.locator('.source-list').getByRole('button',{name:'Result pages',exact:true}).click()
  await submit('pages')
  for (const [tab,more] of [['单曲','加载更多单曲'],['歌单','加载更多歌单']]) {
    if(tab==='歌单')await results.locator('.n-tabs-tab').getByText('歌单',{exact:true}).click()
    const list=results.locator(tab==='歌单'?'.playlist-tab':'.song-tab')
    for(const title of ['two','one','merged'])await list.getByText(title,{exact:true}).waitFor()
    const order=await list.innerText()
    assert.ok(order.indexOf('two')<order.indexOf('one') && order.indexOf('one')<order.indexOf('merged'))
    assert.equal(await list.getByText('skip',{exact:true}).count(),0)
    assert.equal(await list.getByRole('button',{name:more}).count(),0)
  }
  await grant(resultHook,false)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(row=>!row.names.includes('search.results')))
  await submit('raw');await results.locator('.playlist-tab').getByText('skip',{exact:true}).waitFor()
  await submit('scroll-pages')
  for (const [tab, scrollSelector] of [['歌单','.grid-scroll-container'],['单曲','.virtual-scroll-container']]) {
    if (tab==='单曲') await results.locator('.n-tabs-tab').getByText(tab,{exact:true}).click()
    const list=results.locator(tab==='歌单'?'.playlist-tab':'.song-tab')
    await list.getByText('row 0',{exact:true}).waitFor()
    assert.equal(await list.getByText('reached bottom',{exact:true}).count(),0)
    assert.equal(await list.getByRole('button',{name:/加载更多/}).count(),0)
    await list.locator(scrollSelector).evaluate(el=>{el.scrollTop=el.scrollHeight})
    await list.getByText('reached bottom',{exact:true}).waitFor()
  }
  console.log('Electron result pages: filtered first pages, opaque provider cursors, ordered merges and revocation passed for tracks and playlists.')
  console.log('Electron suggestions: provider strings, authorized ordering, stale reply suppression, selection, separate history and revoked default passed.')
  console.log('Electron search: ordered rewrites reached the real provider, draft blur preserved results, cancellation and revocation passed.')
}
