import assert from 'node:assert/strict'

export async function verifyResolveHook(page, previewUrl) {
  const diagnostics=[]
  page.on('console',message=>{if(/音质|播放|换源|resolve|URL|Original source/i.test(message.text()))diagnostics.push(message.text())})
  const manifest={manifestVersion:3,id:'test.resolve',name:'解析换源验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},
    provides:{providers:['initial','alternate'].map(id=>({id,name:id,protocols:['music.search@1','music.resolve@1']})),actions:['attempts','play','blocked','allowed'].map(id=>({id,title:id}))},
    ui:{menus:['attempts','play','blocked','allowed'].map(id=>({id,title:id,slot:'playlist.import',commandId:id}))},uses:{permissions:[{key:'intercept',name:'player.intercept',reason:'解析失败换源'},{key:'search',name:'music.read',reason:'搜索备用音源'},{key:'play',name:'music.control',reason:'点播验收'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const attempts=[],statuses=[],failures=[],advances=[];let cancelError=true;
    for(const id of ['initial','alternate'])ctx.providers.register(id,{tracks:{
      search:async request=>({items:[{ref:{kind:'track',providerId:id,id:request.query==='No match'?'unplayable':'alt',scope:'provider'},title:request.query,metadata:{artists:['QA']},capabilities:['play']}]}),
      resolve:async(ref,quality)=>{attempts.push([id,ref.id,quality]);return id==='alternate' && ['alt','blocked','allowed'].includes(ref.id)?{ok:true,url:${JSON.stringify(previewUrl)}}:ctx.playback.failure({code:'UNSUPPORTED',message:id==='alternate'?'alternate unavailable':'first source unavailable'})}
    }});
    ctx.actions.register('attempts',()=>({attempts,statuses,failures,advances}));
    for(const mode of ['blocked','allowed'])ctx.actions.register(mode,async(_,operation)=>{cancelError=mode==='blocked';await ctx.music.play({kind:'track',providerId:'alternate',id:mode,scope:'provider'},{operation,permissionKey:'play'});return true});
    ctx.hooks.on('player.error',async(op,next)=>{failures.push({source:op.source,input:op.input});if(cancelError)op.preventDefault();else await next()});
    ctx.hooks.on('player.next',op=>{if(op.input.reason==='error'){advances.push(op.input.reason);op.preventDefault()}});
    ctx.actions.register('play',async(_,operation)=>{await ctx.music.play({kind:'track',providerId:'initial',id:'start',scope:'provider'},{operation,permissionKey:'play'});return true});
    ctx.hooks.on('player.resolve',async(op,next)=>{
      const first=await next();statuses.push(first);if(first.ok)return first;
      const page=await ctx.music.search('alternate',{query:op.input.track.title,kinds:['track'],filters:{},limit:1},{operation:op.operation,permissionKey:'search'});
      const result=await next({...op.input,track:page.items[0]});statuses.push(result);return result;
    });
  }`
  const added=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'resolve-hook.js'),code)
  assert.ok(added.pluginId,added.error)
  await page.evaluate(async id=>{await window.ceruQa.plugins.savePermissions(id,['intercept','search','play']);await window.ceruQa.plugins.setEnabled(id,true)},added.pluginId)
  const subscribed=enabled=>page.waitForFunction(enabled=>window.ceruQa.plugins.hookSnapshot().then(row=>row.names.includes('player.resolve')===enabled),enabled,{timeout:5000})
  await subscribed(true)
  await page.getByRole('button',{name:'选择音源',exact:true}).click()
  await page.locator('.source-list').getByRole('button',{name:'initial',exact:true}).click()
  const selection=await page.evaluate(()=>JSON.parse(localStorage.getItem('ceru-music-pending:userInfo')??localStorage.getItem('userInfo')??'{}'))
  assert.equal(selection.selectSources,'initial')
  const request=(method,title='Test')=>page.evaluate(([method,title])=>window.ceruQa.music.requestSdk(method,{source:'initial',songInfo:{source:'initial',songmid:'start',name:title,singer:'QA'},quality:'128k',isCache:false}),[method,title])
  const log=()=>page.evaluate(id=>window.ceruQa.plugins.openPlaylistImportMenu(id,'attempts'),added.pluginId)
  assert.equal(await request('getPlaybackUrl'),previewUrl)
  const resolved=await log()
  assert.deepEqual(resolved.attempts,[['initial','start','128k'],['alternate','alt','128k']]);assert.deepEqual(resolved.statuses,[{ok:false},{ok:true}])
  await page.evaluate(()=>{
    window.resolveQaPlayed=[]
    const play=HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play=function(...args){this.addEventListener('timeupdate',()=>{if(this.currentTime>0)window.resolveQaPlayed.push(this.currentSrc)},{once:true});return play.apply(this,args)}
  })
  await page.evaluate(id=>window.ceruQa.plugins.openPlaylistImportMenu(id,'play'),added.pluginId)
  try {await page.waitForFunction(url=>window.resolveQaPlayed.includes(url),previewUrl,{timeout:10000})}
  catch(error){console.error('Resolve playback diagnostic:',await log(),diagnostics,await page.evaluate(()=>({played:window.resolveQaPlayed,media:Array.from(document.querySelectorAll('audio')).map(audio=>[audio.currentSrc,audio.currentTime]),messages:Array.from(document.querySelectorAll('.t-message')).map(node=>node.textContent)})));throw error}
  const played=await log()
  assert.deepEqual(played.attempts.slice(2).map(row=>row.slice(0,2)),[['initial','start'],['alternate','alt']])
  assert.match((await request('getPlaybackUrl','No match')).error,/alternate unavailable/)
  const failed=await log()
  assert.deepEqual(failed.attempts.slice(played.attempts.length),[['initial','start','128k'],['alternate','unplayable','128k']])
  assert.deepEqual(failed.statuses.slice(played.statuses.length),[{ok:false},{ok:false}])
  await page.evaluate(()=>{location.hash='/settings?category=plugins'})
  await page.getByRole('button',{name:'管理设置',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'插件管理设置'})
  const toggle=dialog.getByRole('switch',{name:'暂停所有插件拦截'})
  await toggle.click();await subscribed(false)
  assert.match((await request('getPlaybackUrl')).error,/first source unavailable/)
  assert.deepEqual((await log()).statuses,failed.statuses)
  await toggle.click();await subscribed(true)
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'})
  assert.match((await request('getMusicUrl')).error,/first source unavailable/)
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['search']),added.pluginId);await subscribed(false)
  assert.match((await request('getPlaybackUrl')).error,/first source unavailable/)
  assert.deepEqual((await log()).attempts,failed.attempts.concat(Array.from({length:3},()=>['initial','start','128k'])))
  console.log('Real playback advanced on the alternate source; two failed sources returned the alternate error. Paused, download and revoked paths did not retry.')
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['intercept','search','play']),added.pluginId)
  await subscribed(true)
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function(...args) {
      if (window.rejectQaStart && this instanceof HTMLAudioElement) {
        window.rejectQaStart = false
        return Promise.reject(new Error('private start diagnostic'))
      }
      return play.apply(this,args)
    }
  })
  for (const [index,mode] of ['blocked','allowed'].entries()) {
    await page.evaluate(async ([id,mode])=>{window.rejectQaStart=true;await window.ceruQa.plugins.openPlaylistImportMenu(id,mode)},[added.pluginId,mode])
    await page.waitForFunction(async ([id,count])=>{const row=await window.ceruQa.plugins.openPlaylistImportMenu(id,'attempts');return row.failures.length===count && (count===1 || row.advances.length===1)},[added.pluginId,index+1],{timeout:10000})
    const result=await log(), failure=result.failures[index]
    assert.deepEqual(failure.source,{kind:'system',location:'playback'})
    assert.equal(failure.input.error,'start')
    assert.equal(failure.input.track.ref.providerId,'alternate')
    assert.equal(failure.input.track.ref.id,mode)
    assert.doesNotMatch(JSON.stringify(failure),/private start diagnostic|https?:|file:/)
    assert.deepEqual(result.advances,index ? ['error'] : [])
  }
  console.log('Injected media start rejection reached the installed worker: cancellation suppressed the advance, pass-through reached next(reason:error) once.')
}
