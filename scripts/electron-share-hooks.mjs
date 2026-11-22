import assert from 'node:assert/strict'

export async function verifyShareHooks(application,page,previewUrl) {
  const manifest={manifestVersion:3,id:'test.share-ui',name:'分享处理验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},
    provides:{providers:[{id:'shareqa',name:'分享测试',protocols:['music.resolve@1']}],actions:['play','log','cancel','custom'].map(id=>({id,title:id}))},
    ui:{menus:['play','log','cancel','custom'].map(id=>({id,title:id,slot:'playlist.import',commandId:id}))},
    uses:{permissions:[{key:'guard',name:'sharing.intercept',reason:'分享测试'},{key:'play',name:'music.control',reason:'播放测试'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    let mode='custom';const log=[];
    ctx.providers.register('shareqa',{tracks:{resolve:async()=>({ok:true,url:${JSON.stringify(previewUrl)}})}});
    ctx.actions.register('play',(_,operation)=>ctx.music.play({kind:'track',providerId:'shareqa',id:'song',scope:'provider'},{operation,permissionKey:'play'}));
    ctx.actions.register('log',()=>log);for(const name of ['cancel','custom'])ctx.actions.register(name,()=>{mode=name;return true});
    ctx.hooks.on('share.create',op=>{log.push({input:op.input,source:op.source});if(mode==='cancel'){op.preventDefault();return}return {id:'custom',url:'https://example.test/share/custom',template:'测试分享链接'}});
  }`
  const owner=await page.evaluate(async code=>{const row=await window.ceruQa.plugins.addPlugin(code,'share-ui.js');if(!row.pluginId)throw Error(row.error);await window.ceruQa.plugins.savePermissions(row.pluginId,['guard','play']);await window.ceruQa.plugins.setEnabled(row.pluginId,true);return row.pluginId},code)
  const action=id=>page.evaluate(([owner,id])=>window.ceruQa.plugins.openPlaylistImportMenu(owner,id),[owner,id])
  const open=async()=>{
    await page.locator('.player-container .left-actions .control-btn').last().click()
    await page.getByText('分享',{exact:true}).last().click()
    const dialog=page.getByRole('dialog').filter({hasText:'分享歌曲'})
    await dialog.waitFor()
    return dialog
  }
  let publishes=0
  page.on('request',request=>{if(request.method()==='POST'&&/\/share(?:\/|$)/.test(new URL(request.url()).pathname))publishes++})
  try {
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(win=>win.webContents.setAudioMuted(true)))
    await action('play')
    let dialog=await open()
    for(const label of ['该插件及音源由我合法取得或已获得授权','该插件不包含破解、绕过正版平台验证的代码','我了解侵权风险由我个人承担'])await dialog.getByText(label,{exact:true}).click()
    await dialog.getByRole('button',{name:'生成分享',exact:true}).click()
    await dialog.getByText('https://example.test/share/custom',{exact:true}).waitFor()
    assert.equal(publishes,0)
    const entries=await action('log')
    assert.equal(entries.length,1)
    assert.deepEqual(entries[0].input.track.ref,{kind:'track',providerId:'shareqa',id:'song'})
    assert.equal(entries[0].source.kind,'ui')
    const descriptorInput={source:'shareqa',songmid:'song',name:'Descriptor',singer:'QA'}
    const descriptor=await page.evaluate(song=>window.ceruQa.share.createDescriptor('shareqa',song),descriptorInput)
    assert.equal(descriptor.url,'https://example.test/share/custom')
    assert.deepEqual((await action('log')).at(-1).source,{kind:'ui',location:'share-descriptor'})
    await dialog.getByRole('button',{name:'关闭',exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    await action('cancel')
    await assert.rejects(page.evaluate(song=>window.ceruQa.share.createDescriptor('shareqa',song),descriptorInput),/分享已由插件取消/)
    dialog=await open()
    await dialog.getByRole('button',{name:'生成分享',exact:true}).click()
    await page.getByText('已由 分享处理验收 处理',{exact:false}).last().waitFor()
    assert.equal(await dialog.locator('.success-actions').count(),0)
    assert.equal(publishes,0)
    await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['play']),owner)
    await dialog.getByRole('button',{name:'生成分享',exact:true}).click()
    await dialog.getByText('请先登录后再分享',{exact:true}).waitFor()
    assert.equal((await action('log')).length,4)
    assert.equal(publishes,0)
    await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['guard','play']),owner)
    await action('custom')
    for(const version of [2,3]) {
      const id='test.share-caller-v'+version, provider='sharecaller'+version
      const permissions=[{key:'publish',name:'sharing.publish',reason:'本地分享验收'}]
      const actions=(version===3?['create','tool']:['create']).map(id=>({id,title:id})),menus=actions.map(row=>({...row,slot:'playlist.import',commandId:row.id})),providers=[{id:provider,name:provider,protocols:['music.search@1']}]
      const caller=version===3?{...manifest,id,name:id,uses:{permissions},provides:{providers,actions},ui:{menus}}:{manifestVersion:2,id,name:id,version:'1.0.0',engines:{hostApi:'^2.0.0',logicRuntime:'ceru-js@1'},modules:{logic:{entry:'logic.main'}},contributes:{providers,commands:actions.map(row=>({...row,action:row.id})),menus},permissions}
      const code='exports.manifest='+JSON.stringify(caller)+`;exports.activate=ctx=>{ctx.providers.register(${JSON.stringify(provider)},{tracks:{search:async()=>({items:[]})}});ctx.actions.register('create',(_,operation)=>ctx.sharing.create({version:1,track:{kind:'track',pluginId:${JSON.stringify(id)},providerId:${JSON.stringify(provider)},id:'one',scope:'provider'},title:'Caller',artists:['QA']},{permissionKey:'publish',operation}));${version===3?`ctx.actions.register('tool',(_,operation)=>ctx.app.call('share.create',{track:{ref:{kind:'track',providerId:${JSON.stringify(provider)},id:'one'},title:'Tool Caller',metadata:{artists:['QA']}}},{permissionKey:'publish',operation}));`:''}}`
      const installed=await page.evaluate(async code=>{const row=await window.ceruQa.plugins.addPlugin(code,'share-caller.js');if(!row.pluginId)throw Error(row.error);await window.ceruQa.plugins.savePermissions(row.pluginId,['publish']);await window.ceruQa.plugins.setEnabled(row.pluginId,true);return row.pluginId},code)
      try {
        const result=await page.evaluate(owner=>window.ceruQa.plugins.openPlaylistImportMenu(owner,'create'),installed)
        assert.deepEqual(result,{id:'custom',url:'https://example.test/share/custom'})
        const last=(await action('log')).at(-1)
        assert.deepEqual(last.source,{kind:'plugin',pluginId:id,runtime:version})
        if(version===3) {
          const invokeTool=()=>page.evaluate(owner=>window.ceruQa.plugins.openPlaylistImportMenu(owner,'tool'),installed)
          assert.deepEqual(await invokeTool(),{id:'custom',url:'https://example.test/share/custom'})
          const toolLog=(await action('log')).at(-1)
          assert.equal(toolLog.input.track.title,'Tool Caller')
          assert.deepEqual(toolLog.source,{kind:'plugin',pluginId:id,runtime:3})
          await action('cancel')
          await assert.rejects(invokeTool(),/分享已由插件取消/)
          await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,[]),installed)
          const count=(await action('log')).length
          await assert.rejects(invokeTool())
          assert.equal((await action('log')).length,count)
          await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['publish']),installed)
          await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['play']),owner)
          const local=await invokeTool()
          assert.ok(local.url.startsWith('cerumusic://share/v2_'))
          const data=JSON.parse(Buffer.from(local.id.slice(3),'base64url').toString())
          assert.equal(data.title,'Tool Caller')
          assert.equal(data.track.providerId,provider)
          assert.equal(publishes,0)
        }
      } finally {await page.evaluate(owner=>window.ceruQa.plugins.uninstallPlugin(owner),installed)}
    }
    console.log('Sharing: real player dialog and descriptor IPC, custom link without publishing, cancellation, public track summary, original login flow after revocation and actual v2/v3 callers passed; app.call returned typed custom/default links and rejected cancellation or revoked permissions.')
  } finally {await page.evaluate(owner=>window.ceruQa.plugins.uninstallPlugin(owner),owner)}
}
