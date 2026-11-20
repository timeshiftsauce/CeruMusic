import assert from 'node:assert/strict'

export async function verifyLyricsHooks(application,page,previewUrl) {
  const manifest={manifestVersion:3,id:'test.lyrics',name:'歌词处理验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},
    provides:{providers:[{id:'lyricqa',name:'歌词测试',protocols:['music.search@1','music.resolve@1','music.lyrics@1']}],actions:['log','original','slow','next'].map(id=>({id,title:id}))},
    ui:{menus:['log','original','slow','next'].map(id=>({id,title:id,slot:'playlist.import',commandId:id}))},uses:{permissions:[{key:'lyrics',name:'lyrics.intercept',reason:'补充歌词翻译'},{key:'play',name:'music.control',reason:'播放验收'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const log=[];ctx.actions.register('log',()=>log);
    const song=id=>({ref:{kind:'track',providerId:'lyricqa',id,scope:'provider'},title:id,metadata:{artists:['QA']},capabilities:['play']});
    for(const id of ['original','slow','next'])ctx.actions.register(id,(_,operation)=>ctx.music.play(song(id).ref,{operation,permissionKey:'play'}));
    ctx.providers.register('lyricqa',{tracks:{search:async()=>({items:[song('original')]}),resolve:async()=>({ok:true,url:${JSON.stringify(previewUrl)}}),lyrics:async ref=>({format:'crlyric',version:1,track:ref,offsetMs:0,lines:ref.id==='missing'?[]:[{startTimeMs:0,text:'原文 '+ref.id}]})}});
    ctx.hooks.on('lyrics.load',async(op,next)=>{log.push({name:'load',input:op.input});if(op.input.track.ref.id==='slow')await new Promise(resolve=>setTimeout(resolve,1500));const value=await next();return value??{format:'crlyric',version:1,track:op.input.track.ref,offsetMs:0,lines:[{startTimeMs:0,text:'补充歌词'}]}});
    ctx.hooks.on('lyrics.transform',async(op,next)=>{log.push({name:'transform',input:op.input});const value=await next();return value?{...value,lines:value.lines.map(line=>({...line,translation:'翻译 '+line.text}))}:null});
  }`
  const owner=await page.evaluate(async code=>{const row=await window.ceruQa.plugins.addPlugin(code,'lyrics.js');if(!row.pluginId)throw Error(row.error);await window.ceruQa.plugins.savePermissions(row.pluginId,['lyrics','play']);await window.ceruQa.plugins.setEnabled(row.pluginId,true);return row.pluginId},code)
  const grants=keys=>page.evaluate(([owner,keys])=>window.ceruQa.plugins.savePermissions(owner,keys),[owner,keys])
  const call=id=>page.evaluate(id=>window.ceruQa.music.requestSdk('getLyric',{source:'lyricqa',songInfo:{source:'lyricqa',songmid:id,name:id,singer:'QA'}}),id)
  const log=()=>page.evaluate(owner=>window.ceruQa.plugins.openPlaylistImportMenu(owner,'log'),owner)
  const action=id=>page.evaluate(([owner,id])=>window.ceruQa.plugins.openPlaylistImportMenu(owner,id),[owner,id])
  const first=await call('original');assert.equal(first.crlyric.lines[0].translation,'翻译 原文 original')
  const missing=await call('missing');assert.equal(missing.crlyric.lines[0].text,'补充歌词');assert.equal(missing.crlyric.lines[0].translation,'翻译 补充歌词')
  const local=await page.evaluate(()=>window.ceruQa.music.requestSdk('parseLyrics',{source:'local',text:'[00:00.00]本地歌词',track:{pluginId:'local.library',providerId:'local',kind:'track',id:'private-local-id'},songInfo:{source:'local',songmid:'private-local-id',name:'Local',singer:'QA'}}))
  assert.equal(local.lines[0].translation,'翻译 本地歌词')
  const entries=await log();assert.equal(entries.length,6)
  assert.ok(!JSON.stringify(entries).includes('private-local-id'))
  assert.equal(entries[4].input.track.ref.providerId,'private')
  await grants(['play'])
  const raw=await call('original');assert.equal(raw.crlyric.lines[0].translation,undefined);assert.equal(raw.crlyric.lines[0].text,'原文 original')
  assert.equal((await call('missing')).crlyric.lines.length,0)
  assert.deepEqual(await log(),entries)
  await grants(['lyrics','play'])
  await application.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.webContents.setAudioMuted(true)})
  await page.getByRole('button',{name:'选择音源',exact:true}).click()
  await page.locator('.source-list').getByRole('button',{name:'歌词测试',exact:true}).click()
  await action('original')
  await page.locator('.player-container').dispatchEvent('click')
  const player=page.locator('.full-play.active')
  await player.getByText('原文 original',{exact:true}).first().waitFor({timeout:10000})
  // Finish slow lyrics after switching; they must never overwrite the next track.
  const pending=action('slow')
  await page.waitForFunction(owner=>window.ceruQa.plugins.openPlaylistImportMenu(owner,'log').then(rows=>rows.some(row=>row.name==='load'&&row.input.track.ref.id==='slow')),owner)
  await action('next');await pending
  await player.getByText('原文 next',{exact:true}).first().waitFor({timeout:10000})
  await page.waitForFunction(owner=>window.ceruQa.plugins.openPlaylistImportMenu(owner,'log').then(rows=>rows.some(row=>row.name==='transform'&&row.input.track.ref.id==='slow')),owner)
  assert.equal(await player.getByText('原文 slow',{exact:true}).count(),0)
  assert.ok(await player.getByText('原文 next',{exact:true}).count()>0)
  console.log('Lyrics: online and local transformation, missing fallback, private reference redaction, raw cache after revocation, real playback and late-result track isolation passed.')
}
