import assert from 'node:assert/strict'

export async function verifyTrackLike(application,page) {
  await application.evaluate(({app})=>{
    const {MusicDatabase}=globalThis.runtimeTestRequire('./databases.cjs'),db=new MusicDatabase()
    for(const [index,title] of ['Observe','Replace','Cancel'].entries()) {
      const path=globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'),title+'.wav')
      globalThis.runtimeTestRequire('node:fs').copyFileSync(globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'),'transport.wav'),path)
      db.upsertTrack({songmid:'like-'+index,path,url:null,singer:'QA',name:title,albumName:'QA',albumId:0,source:'local',interval:'00:30',hasCover:0,coverKey:null,year:2026,lrc:'',types:'[]',_types:'{}',typeUrl:'{}',bitrate:705600,sampleRate:44100,channels:1,duration:30,size:2646044,mtime_ms:1,hash:null,updated_at:Date.now()})
    }
  })
  await page.reload({waitUntil:'domcontentloaded'})
  const manifest={manifestVersion:3,id:'test.track-like',name:'收藏测试插件',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'library',name:'library.intercept',reason:'收藏验收'}]}}
  const probes=['snapshot','release']
  manifest.provides={actions:probes.map(id=>({id,title:id}))}
  manifest.ui={menus:probes.map(id=>({id,title:id,slot:'playlist.import',commandId:id}))}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    let last=null,release,phase='idle';
    ctx.actions.register('snapshot',()=>({last,phase}));ctx.actions.register('release',()=>{if(release)release();return true});
    return ctx.hooks.on('track.like',async(op,next)=>{
    last={input:op.input,source:op.source};
    if(op.input.track.title==='Hold'){
      phase='waiting';await new Promise(resolve=>{release=resolve});
      try{await next()}finally{phase='finished';release=null}return;
    }
    if (op.input.track.title==='Cancel')op.preventDefault();
    if (op.input.track.title==='Replace')await next({...op.input,track:{ref:{kind:'track',providerId:'catalog',id:'replacement'},metadata:{artists:['QA']},title:'Replacement'}})
  })}`
  const added=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'likes.js'),code)
  assert.ok(added.pluginId,added.error)
  await page.evaluate(async id=>{await window.ceruQa.plugins.setEnabled(id,true);await window.ceruQa.plugins.savePermissions(id,['library'])},added.pluginId)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(row=>row.names.includes('track.like')))
  const click=title=>page.locator('.song-item').filter({hasText:title}).locator('.like-btn').click()
  const expectSongs=async titles=>page.waitForFunction(async titles=>{
    const favorites=await window.ceruQa.songList.getFavoritesId()
    const songs=favorites.data?(await window.ceruQa.songList.getSongs(favorites.data)).data:[]
    return JSON.stringify(songs.map(song=>song.name).sort())===JSON.stringify(titles)
  },titles.sort(),{timeout:8000})
  await click('Observe');await expectSongs(['Observe'])
  await click('Observe');await expectSongs([])
  await click('Replace');await expectSongs(['Replacement'])
  const notice=page.locator('.t-message').filter({hasText:'已由 收藏测试插件 处理',has:page.locator('button:enabled')}).last()
  await notice.getByRole('button',{name:'撤销本次'}).click();await expectSongs(['Replace'])
  await click('Cancel')
  await page.waitForFunction(()=>window.ceruQa.plugins.hookControls().then(state=>state.activity.some(row=>row.name==='track.like' && row.action==='cancel')))
  await notice.getByRole('button',{name:'撤销本次'}).waitFor()
  await expectSongs(['Replace'])
  await notice.getByRole('button',{name:'撤销本次'}).click();await expectSongs(['Replace','Cancel'])
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,[]),added.pluginId)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(row=>!row.names.includes('track.like')))
  await click('Cancel');await expectSongs(['Replace'])
  await page.locator('.song-item').filter({hasText:'Observe'}).click({button:'right'})
  await page.getByText('加入我的喜欢',{exact:true}).click();await expectSongs(['Replace','Observe'])
  const observe=page.locator('.song-item').filter({hasText:'Observe'})
  await observe.hover();await observe.locator('.play-btn').click()
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('audio')).some(media=>!media.paused && media.currentSrc.includes('Observe.wav')))
  await page.locator('.player-container .left-actions .like-btn').click();await expectSongs(['Replace'])
  await application.evaluate(({webContents})=>webContents.fromId(globalThis.runtimeTestMainId).send('toggleLike'))
  await expectSongs(['Replace','Observe'])
  console.log('Track favorites: observation, replacement, cancellation, undo and revoked default verified against the local favorites playlist.')
  const commands=['catalog','add','remove','replace','cancel','hold','stage-private','named-add','named-remove','drop-private','named-mixed','pause','resume','previous','seek','volume','mode','state']
  const callerManifest={...manifest,id:'test.operation-caller',name:'主动操作验收',
    provides:{actions:commands.map(id=>({id,title:id})),providers:[{id:'caller-source',name:'收藏验收源',protocols:['music.search@1']}]},
    ui:{menus:commands.map(id=>({id,title:id,slot:'playlist.import',commandId:id}))},
    uses:{permissions:[...manifest.uses.permissions,{key:'write',name:'library.write',reason:'收藏验收'},{key:'control',name:'player.control',reason:'播放验收'},{key:'read',name:'player.read',reason:'核对播放状态'}]}}
  const callerCode='exports.manifest='+JSON.stringify(callerManifest)+`;exports.activate=ctx=>{
    ctx.providers.register('caller-source',{tracks:{search:async()=>({items:[]})}});
    const ref={kind:'track',pluginId:'test.operation-caller',providerId:'caller-source',id:'opaque-id',connectionId:'private-connection',data:{note:'owner-only'}};
    ctx.actions.register('stage-private',async(_,operation)=>{await ctx.queue.append([{ref,title:'Private QA',metadata:{artists:['QA']},capabilities:['play']}],{operation,permissionKey:'control'});return true});
    ctx.actions.register('drop-private',async(_,operation)=>{await ctx.queue.remove([ref],{operation,permissionKey:'control'});return true});
    ctx.actions.register('named-add',async(_,operation)=>{await ctx.favorites.add([ref,ref],{operation,permissionKey:'write'});return true});
    ctx.actions.register('named-remove',async(_,operation)=>{await ctx.favorites.remove([ref],{operation,permissionKey:'write'});return true});
    ctx.actions.register('named-mixed',async(_,operation)=>{await ctx.favorites.add([ref,{...ref,id:'absent'}],{operation,permissionKey:'write'});return true});
    ctx.actions.register('catalog',()=>ctx.app.operations.list());
    ctx.actions.register('state',(_,operation)=>ctx.player.getState({operation,permissionKey:'read'}));
    for(const [id,title,liked] of [['add','Called',true],['remove','Called',false],['replace','Replace',true],['cancel','Cancel',true],['hold','Hold',true]])
      ctx.actions.register(id,async (_,operation)=>{await ctx.app.call('track.like',{track:{ref:{kind:'track',providerId:'catalog',id:'called'},title,metadata:{artists:['QA']}},liked},{operation,permissionKey:'write'});return true});
    for(const [id,name,input] of [['pause','player.pause',{}],['resume','player.resume',{}],['previous','player.previous',{}],['seek','player.seek',{positionMs:4000}],['volume','player.setVolume',{volume:0.3}],['mode','player.setMode',{mode:'single'}]])
      ctx.actions.register(id,async (_,operation)=>{await ctx.app.call(name,input,{operation,permissionKey:'control'});return true});
  }`
  const caller=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'operation-caller.js'),callerCode)
  assert.ok(caller.pluginId,caller.error)
  const grants=keys=>page.evaluate(([id,keys])=>window.ceruQa.plugins.savePermissions(id,keys),[caller.pluginId,keys])
  const action=id=>page.evaluate(([owner,id])=>window.ceruQa.plugins.openPlaylistImportMenu(owner,id),[caller.pluginId,id])
  const denied=async id=>{
    const result=action(id).then(()=>'',error=>String(error))
    const cancel=page.locator('.t-dialog:visible').filter({hasText:'主动操作验收'}).getByRole('button',{name:'取消',exact:true})
    const first=await Promise.race([result.then(()=>false),cancel.waitFor({timeout:7500}).then(()=>true)])
    if(first) await cancel.click()
    assert.match(await result,/尚未获得授权/)
  }
  await grants(['library']);await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,true),caller.pluginId)
  const catalog=await action('catalog')
  assert.equal(catalog.find(row=>row.name==='track.like').permission,'library.write')
  await denied('add');await expectSongs(['Replace','Observe'])
  await grants(['write','control','read'])
  assert.equal(await action('add'),true);await expectSongs(['Replace','Observe','Called'])
  assert.equal(await action('remove'),true);await expectSongs(['Replace','Observe'])
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['library']),added.pluginId)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(row=>row.names.includes('track.like')))
  assert.equal(await action('replace'),true);await expectSongs(['Replace','Observe','Replacement'])
  assert.equal(await action('cancel'),true);await expectSongs(['Replace','Observe','Replacement'])
  for(const id of ['volume','mode','seek','pause']) assert.equal(await action(id),true)
  const paused=await action('state')
  assert.equal(paused.volume,0.3);assert.equal(paused.repeat,'one');assert.equal(paused.status,'paused')
  assert.ok(paused.positionMs>=3900 && paused.positionMs<6500,JSON.stringify(paused))
  assert.equal(await action('resume'),true)
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('audio')).some(media=>!media.paused))
  assert.equal(await action('previous'),true)
  const probe=key=>page.evaluate(([owner,key])=>window.ceruQa.plugins.openPlaylistImportMenu(owner,key),[added.pluginId,key])
  await action('stage-private')
  await assert.rejects(action('named-mixed'),/不在当前队列/);await expectSongs(['Replace','Observe','Replacement'])
  await action('named-add');await expectSongs(['Replace','Observe','Replacement','Private QA'])
  const observation=(await probe('snapshot')).last
  assert.equal(observation.source.pluginId,callerManifest.id);assert.equal(observation.input.track.ref.providerId,'private')
  for(const hidden of ['opaque-id','private-connection','owner-only']) assert.ok(!JSON.stringify(observation).includes(hidden))
  await action('drop-private');await action('named-remove');await expectSongs(['Replace','Observe','Replacement'])
  await action('named-remove')
  const pending=action('hold').then(()=>null,error=>String(error))
  await page.waitForFunction(owner=>window.ceruQa.plugins.openPlaylistImportMenu(owner,'snapshot').then(row=>row.phase==='waiting'),added.pluginId,{timeout:3000,polling:20})
  await grants(['control','read']);await probe('release')
  assert.ok(await pending,'revocation must reject the in-flight call')
  await page.waitForFunction(owner=>window.ceruQa.plugins.openPlaylistImportMenu(owner,'snapshot').then(row=>row.phase==='finished'),added.pluginId,{timeout:3000})
  await expectSongs(['Replace','Observe','Replacement'])
  await grants([]);await denied('add');await denied('pause')
  await expectSongs(['Replace','Observe','Replacement'])
  console.log('Worker operation discovery and calls: grants, actual favorites, another plugin rewriting/cancelling, playback and revocation passed.')
  console.log('Named favorites: batch preflight, private projection and off-queue remove passed; in-flight revocation prevented the default write.')
}
