import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { gunzipSync } from 'node:zlib'

const CryptoJS = createRequire(import.meta.url)('crypto-js')

export async function verifyPlaylistCreate(page, application) {
  const actions=['log','release']
  const manifest={manifestVersion:3,id:'test.playlist-create',name:'歌单验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'guard',name:'library.intercept',reason:'验证歌单创建'}]},provides:{actions:actions.map(id=>({id,title:id}))},ui:{menus:actions.map(id=>({id,title:id,slot:'playlist.import',commandId:id}))}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const requests=[];let release,finished=false;
    ctx.actions.register('log',()=>({requests,finished}));ctx.actions.register('release',()=>{release?.();return true});
    ctx.hooks.on('playlist.create',async(op,next)=>{requests.push({input:op.input,source:op.source});
      if(op.input.name==='QA Cancel')op.preventDefault();
      else if(op.input.name==='QA Late'){await new Promise(resolve=>{release=resolve});await next();finished=true}
      else await next({...op.input,name:op.input.name+' rewritten'});
    });
  }`
  const installed=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'playlist-create.js'),code)
  assert.ok(installed.pluginId,installed.error)
  const owner=installed.pluginId, grant=keys=>page.evaluate(([owner,keys])=>window.ceruQa.plugins.savePermissions(owner,keys),[owner,keys])
  const probe=name=>page.evaluate(([owner,name])=>window.ceruQa.plugins.openPlaylistImportMenu(owner,name),[owner,name])
  const stored=()=>page.evaluate(async()=>{const result=await window.ceruQa.songList.getAll();if(!result.success)throw Error(result.error);return result.data.filter(row=>row.name.startsWith('QA '))})
  async function until(read,check) {
    const deadline=Date.now()+8000
    let value
    do { value=await read();if(check(value))return value;await new Promise(resolve=>setTimeout(resolve,80)) } while(Date.now()<deadline)
    assert.fail('Timed out: '+JSON.stringify(value))
  }
  await grant(['guard']);await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,true),owner)
  const names=()=>page.evaluate(()=>window.ceruQa.plugins.hookSnapshot().then(row=>row.names))
  await until(names,names=>names.includes('playlist.create'))
  await page.evaluate(()=>{location.hash='/home/songlist'})
  const form=page.locator('.t-dialog:visible').filter({hasText:'创建新歌单'}), undo=page.locator('.t-message:visible').filter({hasText:'已由 歌单验收 处理'}).getByRole('button',{name:'撤销本次'}).and(page.locator(':enabled')).last()
  try { await page.getByText('新建歌单',{exact:true}).first().waitFor({timeout:10000}) }
  catch(error) { console.error('Playlist route diagnostic:',page.url(),await page.locator('body').innerText());throw error }
  const desc='private QA description'
  const submit=async name=>{
    await page.locator('.header-actions button').filter({hasText:'新建歌单'}).click()
    await form.getByPlaceholder('请输入歌单名称').fill(name);await form.getByPlaceholder('请输入歌单描述（可选）').fill(desc)
    await form.getByRole('button',{name:'创建',exact:true}).click()
  }
  await submit('QA Original')
  const [rewritten]=await until(stored,rows=>rows.length===1 && rows[0].name==='QA Original rewritten');assert.equal(rewritten.description,desc)
  await undo.click()
  const [restored]=await until(stored,rows=>rows.length===1 && rows[0].name==='QA Original');assert.equal(restored.id,rewritten.id)
  await submit('QA Cancel');await undo.waitFor();assert.equal(await form.isVisible(),true);assert.equal((await stored()).length,1)
  await undo.click();await until(stored,rows=>rows.length===2 && rows.some(row=>row.name==='QA Cancel'))
  await submit('QA Late');await until(()=>probe('log'),state=>state.requests.length===3)
  await form.getByRole('button',{name:'取消',exact:true}).click();await probe('release')
  const log=await until(()=>probe('log'),state=>state.finished)
  assert.deepEqual(log.requests,['QA Original','QA Cancel','QA Late'].map(name=>({input:{name,location:'local'},source:{kind:'ui',location:'playlists'}})))
  assert.equal((await stored()).length,2)
  await grant([]);await until(names,names=>!names.includes('playlist.create'))
  await submit('QA Revoked');await until(stored,rows=>rows.length===3 && rows.some(row=>row.name==='QA Revoked'));assert.deepEqual(await probe('log'),log)
  console.log('Playlist create verified persisted rename, same-ID undo, cancellation, one-time replay, stale form suppression, private description and revoked default.')
  const deleteManifest={...manifest,id:'test.playlist-delete',name:'删除验收'}
  const deleteCode='exports.manifest='+JSON.stringify(deleteManifest)+`;exports.activate=ctx=>{
    const calls=[];ctx.actions.register('log',()=>calls);
    ctx.hooks.on('playlist.delete',async(op,next)=>{calls.push({input:op.input,source:op.source});if(op.input.playlist.name==='QA Cancel')op.preventDefault();else await next()});
  }`
  const deletion=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'playlist-delete.js'),deleteCode)
  assert.ok(deletion.pluginId,deletion.error)
  await page.evaluate(async id=>{await window.ceruQa.plugins.savePermissions(id,['guard']);await window.ceruQa.plugins.setEnabled(id,true)},deletion.pluginId)
  await until(names,names=>names.includes('playlist.delete'))
  const records=await stored(), cancelled=records.find(row=>row.name==='QA Cancel')
  const confirm=page.locator('.t-dialog:visible').filter({hasText:'确认删除'})
  const openDelete=async name=>{
    await until(()=>confirm.count(),count=>count===0)
    const card=page.locator('.playlist-card').filter({has:page.locator('.playlist-name-text',{hasText:name})})
    await card.hover();await card.locator('button:has(.icon-shanchu)').click();await confirm.waitFor()
  }
  const deleteUndo=page.locator('.t-message:visible').filter({hasText:'已由 删除验收 处理'}).getByRole('button',{name:'撤销本次'}).and(page.locator(':enabled')).last()
  const deleteLog=()=>page.evaluate(id=>window.ceruQa.plugins.openPlaylistImportMenu(id,'log'),deletion.pluginId)
  await openDelete('QA Cancel');await confirm.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await deleteLog(),[])
  await openDelete('QA Cancel');await confirm.getByRole('button',{name:'删除',exact:true}).click();await deleteUndo.waitFor()
  assert.deepEqual(await deleteLog(),[{input:{playlist:{id:cancelled.id,name:'QA Cancel',location:'local'}},source:{kind:'ui',location:'playlists'}}]);assert.equal((await stored()).length,3)
  await until(()=>confirm.count(),count=>count===0)
  await deleteUndo.click();await confirm.waitFor();assert.equal((await stored()).length,3)
  await confirm.getByRole('button',{name:'删除',exact:true}).click();await until(stored,rows=>rows.length===2 && rows.every(row=>row.id!==cancelled.id))
  await openDelete('QA Original');await confirm.getByRole('button',{name:'删除',exact:true}).click();await until(stored,rows=>rows.length===1 && rows[0].name==='QA Revoked')
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,[]),deletion.pluginId);await until(names,names=>!names.includes('playlist.delete'))
  await openDelete('QA Revoked');await confirm.getByRole('button',{name:'删除',exact:true}).click();await until(stored,rows=>rows.length===0)
  assert.equal((await deleteLog()).length,2)
  console.log('Playlist deletion: initial cancel made no hook call, hook cancellation retained the row, undo required fresh confirmation, grant and revoke removed only their targets.')
  await verifyPlaylistTracks(page,manifest,until,names)
  await verifyPlaylistExport(page,application,manifest,until,names)
  await verifyPlaylistImport(page,manifest,until,names)
  await verifyPlaylistTools(page,application,until)
  await verifyWindowClose(page,application,manifest,until,names)
}

async function verifyPlaylistTools(page,application,until) {
  const manifest={manifestVersion:3,id:'test.playlist-tools',name:'歌单调用验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'main'}},
    provides:{actions:[{id:'run',title:'run'}],importers:[{id:'demo',title:'工具导入器'}]},ui:{menus:[{id:'run',title:'run',slot:'playlist.import',commandId:'run'}]},
    uses:{permissions:[{key:'write',name:'library.write',reason:'验证歌单写入'},{key:'read',name:'library.read',reason:'验证歌单导出'},{key:'delete',name:'library.delete',reason:'验证歌单删除'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    ctx.actions.register('run',async(_input,operation)=>{const data=await ctx.config.get();return ctx.app.call(data.name,data.input,{permissionKey:data.name==='playlist.export'?'read':['playlist.delete','playlist.removeTracks'].includes(data.name)?'delete':'write',operation})});
    ctx.playlistImporters.register('demo',{async getTracks(){return {name:'Tool Imported',items:[{ref:{kind:'track',providerId:'demo',pluginId:ctx.plugin.id,id:'imported'},title:'Imported',metadata:{artists:['QA']},capabilities:[],playable:false}]}}});
  }`
  const owner=await page.evaluate(async code=>{const added=await window.ceruQa.plugins.addPlugin(code,'playlist-tools.js');if(!added.pluginId)throw Error(added.error);await window.ceruQa.plugins.savePermissions(added.pluginId,['write','read','delete']);await window.ceruQa.plugins.setEnabled(added.pluginId,true);return added.pluginId},code)
  const run=async(name,input)=>{
    await page.evaluate(([id,config])=>window.ceruQa.plugins.saveConfig(id,config),[owner,{name,input}])
    return page.evaluate(id=>window.ceruQa.plugins.openPlaylistImportMenu(id,'run'),owner)
  }
  const lists=()=>page.evaluate(async()=>(await window.ceruQa.songList.getAll()).data)
  try {
    assert.equal(await run('playlist.create',{name:'Tool Created',location:'local'}),null)
    const created=(await lists()).find(row=>row.name==='Tool Created')
    assert.ok(created)
    const playlist={id:created.id,name:created.name,location:'local'}
    const track={ref:{kind:'track',providerId:'demo',id:'tool-song'},title:'Tool Song',metadata:{artists:['QA']}}
    assert.equal(await run('playlist.addTracks',{playlist,tracks:[track]}),null)
    assert.equal((await page.evaluate(async id=>(await window.ceruQa.songList.getSongs(id)).data,created.id)).length,1)
    const downloads=await application.evaluate(()=>globalThis.exportTestDownloads.length)
    assert.equal(await run('playlist.export',{playlist,format:'cmpl'}),null)
    await until(()=>application.evaluate(()=>globalThis.exportTestDownloads),rows=>rows.length===downloads+1&&rows.at(-1).state==='completed')
    assert.equal(await run('playlist.removeTracks',{playlist,tracks:[track]}),null)
    assert.equal((await page.evaluate(async id=>(await window.ceruQa.songList.getSongs(id)).data,created.id)).length,0)
    assert.equal(await run('playlist.import',{value:'tool-input',importerId:'test.playlist-tools:demo'}),null)
    const imported=(await lists()).find(row=>row.name==='Tool Imported (导入)')
    assert.ok(imported)
    assert.equal((await page.evaluate(async id=>(await window.ceruQa.songList.getSongs(id)).data,imported.id)).length,1)
    assert.equal(await run('playlist.delete',{playlist}),null)
    assert.ok((await lists()).every(row=>row.id!==created.id))
    console.log('Six playlist tools passed through actual worker, dispatcher, renderer, local database, importer and file export.')
  } finally {
    await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),owner)
  }
}

export async function verifyWindowClose(page,application,base,until,names) {
  base ??= {manifestVersion:3,version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{actions:['log','release'].map(id=>({id,title:id}))},ui:{menus:['log','release'].map(id=>({id,title:id,slot:'playlist.import',commandId:id}))}}
  until ??= async(read,check)=>{
    const deadline=Date.now()+8000
    let value
    do {value=await read();if(check(value))return value;await new Promise(resolve=>setTimeout(resolve,80))} while(Date.now()<deadline)
    assert.fail('Timed out: '+JSON.stringify(value))
  }
  names ??= ()=>page.evaluate(()=>window.ceruQa.plugins.hookSnapshot().then(row=>row.names))
  const manifest={...base,id:'test.window-close',name:'窗口拦截验收',uses:{permissions:[{key:'guard',name:'window.intercept',reason:'窗口关闭测试'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const log=[];ctx.actions.register('log',()=>log);ctx.actions.register('release',()=>true);
    ctx.hooks.on('window.close',op=>{log.push({input:op.input,source:op.source});op.preventDefault()});
  }`
  const owner=await page.evaluate(async code=>{const row=await window.ceruQa.plugins.addPlugin(code,'window-close.js');if(!row.pluginId)throw Error(row.error);await window.ceruQa.plugins.savePermissions(row.pluginId,['guard']);await window.ceruQa.plugins.setEnabled(row.pluginId,true);return row.pluginId},code)
  const log=()=>page.evaluate(id=>window.ceruQa.plugins.openPlaylistImportMenu(id,'log'),owner)
  const dialog=page.locator('.t-dialog:visible').filter({hasText:'您希望如何处理关闭操作？'})
  await until(names,rows=>rows.includes('window.close'))
  const button=page.locator('button.close-btn:visible').first()
  await button.click();await until(log,rows=>rows.length===1);assert.equal(await dialog.count(),0)
  await page.locator('.t-message:visible').filter({hasText:'已由 窗口拦截验收 处理'}).last().waitFor()
  await application.evaluate(({BrowserWindow},url)=>{
    const win=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL()===url)
    if(!win)throw Error('Missing main window')
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'W',modifiers:['control']})
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'W',modifiers:['control']})
  },page.url())
  await until(log,rows=>rows.length===2);assert.equal(await dialog.count(),0)
  assert.deepEqual((await log()).map(row=>row.source.location),['titlebar','shortcut']);assert.ok((await log()).every(row=>JSON.stringify(row.input)==='{}'))
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,[]),owner);await until(names,rows=>!rows.includes('window.close'))
  await button.click();await dialog.waitFor();assert.equal((await log()).length,2)
  await dialog.locator('.t-dialog__close').click();await until(()=>dialog.count(),count=>count===0)
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['guard']),owner);await until(names,rows=>rows.includes('window.close'))
  await button.click();await until(log,rows=>rows.length===3)
  const undo=page.locator('.t-message:visible').filter({hasText:'已由 窗口拦截验收 处理'}).getByRole('button',{name:'撤销本次'}).and(page.locator(':enabled')).last()
  await undo.click();await dialog.waitFor();assert.equal((await log()).length,3)
  await application.evaluate(({app,BrowserWindow,ipcMain})=>{
    globalThis.windowCloseEvents=[]
    const record=type=>globalThis.windowCloseEvents.push({type,time:Date.now(),windows:BrowserWindow.getAllWindows().map(win=>({id:win.id,visible:win.isVisible(),url:win.webContents.getURL()}))})
    for(const name of ['before-quit','will-quit','window-all-closed','quit'])app.on(name,()=>record(name))
    ipcMain.on('window-close',()=>record('window-close'))
    for(const win of BrowserWindow.getAllWindows()){const id=win.id;for(const name of ['close','closed'])win.on(name,()=>record(id+':'+name))}
  })
  const exited=new Promise(resolve=>{
    const timer=setTimeout(()=>resolve('timeout'),8000)
    application.process().once('exit',code=>{clearTimeout(timer);resolve(code)})
  })
  try { await dialog.getByRole('button',{name:/直接退出/}).click({timeout:5000}) }
  catch(error) {console.error('Exit click diagnostic:',await page.locator('.t-dialog:visible').allTextContents(),await application.evaluate(()=>globalThis.windowCloseEvents));throw error}
  const exitCode=await exited
  if(exitCode==='timeout')console.error('Window exit events:',await application.evaluate(()=>globalThis.windowCloseEvents).catch(error=>String(error)))
  assert.equal(exitCode,0,'Explicit exit was blocked')
  console.log('Window close: titlebar and Ctrl+W canceled; revocation restored the original dialog; undo bypassed the hook and explicit exit completed.')
}

async function verifyPlaylistImport(page,base,until,names) {
  const install=code=>page.evaluate(async code=>{const result=await window.ceruQa.plugins.addPlugin(code,'playlist-import.js');if(!result.pluginId)throw Error(result.error);await window.ceruQa.plugins.setEnabled(result.pluginId,true);return result.pluginId},code)
  const importers=[]
  for(const suffix of ['first','second']) {
    const manifest={...base,id:'test.import-'+suffix,name:'导入器 '+suffix,uses:{permissions:[]},provides:{actions:base.provides.actions,importers:[{id:'lists',title:'导入器 '+suffix}]}}
    const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
      const log=[];ctx.actions.register('log',()=>log);ctx.actions.register('release',()=>ctx.ui.playlistImport.open({importerId:'lists'}));
      ctx.playlistImporters.register('lists',{async getTracks(request){log.push(request);const second=request.cursor==='page2';return {name:'Import '+request.value,items:[{ref:{kind:'track',providerId:'demo',pluginId:ctx.plugin.id,id:second?'two':'one'},title:request.value+(second?' two':' one'),metadata:{artists:['QA']},capabilities:[],playable:false}],...(second?{}:{nextCursor:'page2'})}}});
    }`
    importers.push(await install(code))
  }
  const manifest={...base,id:'test.import-hook',name:'导入拦截验收'}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const log=[];ctx.actions.register('log',()=>log);ctx.actions.register('release',()=>true);
    ctx.hooks.on('playlist.import',async(op,next)=>{log.push({input:op.input,source:op.source});if(op.input.value==='cancel')op.preventDefault();else await next({value:'rewritten',importerId:'test.import-second:lists'})});
  }`
  const owner=await install(code)
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['guard']),owner)
  await until(names,list=>list.includes('playlist.import'))
  const action=(id,name)=>page.evaluate(([id,name])=>window.ceruQa.plugins.openPlaylistImportMenu(id,name),[id,name])
  const stored=()=>page.evaluate(async()=>(await window.ceruQa.songList.getAll()).data.filter(item=>item.name.startsWith('Import ')))
  const submit=async value=>{
    await action(importers[0],'release')
    const form=page.locator('.t-dialog:visible').filter({has:page.locator('.network-import-content')})
    await form.getByRole('textbox').fill(value)
    await form.getByRole('button',{name:'开始导入',exact:true}).click()
    await until(()=>form.count(),count=>count===0)
  }
  await submit('cancel');await until(()=>action(owner,'log'),rows=>rows.length===1)
  assert.deepEqual(await stored(),[]);assert.deepEqual(await action(importers[0],'log'),[]);assert.deepEqual(await action(importers[1],'log'),[])
  await submit('original')
  const [created]=await until(stored,rows=>rows.length===1 && rows[0].name==='Import rewritten (导入)')
  const songs=await until(()=>page.evaluate(async id=>(await window.ceruQa.songList.getSongs(id)).data,created.id),rows=>rows.length===2)
  assert.deepEqual(songs.map(song=>song.name).sort(),['rewritten one','rewritten two'])
  assert.deepEqual(await action(importers[0],'log'),[])
  const calls=await action(importers[1],'log');assert.equal(calls.length,2);assert.ok(calls.every(row=>row.value==='rewritten'));assert.equal(calls[1].cursor,'page2')
  const log=await action(owner,'log');assert.deepEqual(log.map(row=>row.input),[{value:'cancel',importerId:'test.import-first:lists'},{value:'original',importerId:'test.import-first:lists'}]);assert.ok(log.every(row=>row.source.location==='playlist-import'))
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,[]),owner);await until(names,list=>!list.includes('playlist.import'))
  await submit('default');await until(stored,rows=>rows.length===2 && rows.some(row=>row.name==='Import default (导入)'))
  assert.equal((await action(importers[0],'log')).length,2);assert.deepEqual(await action(owner,'log'),log)
  console.log('Playlist import: cancellation skipped all reads and writes; rewritten input selected another active importer across two pages; revoked hook restored the original importer.')
}

async function verifyPlaylistExport(page,application,base,until,names) {
  await application.evaluate(({session,app})=>{
    const fs=globalThis.runtimeTestRequire('node:fs'),path=globalThis.runtimeTestRequire('node:path')
    globalThis.exportTestDownloads=[]
    session.defaultSession.on('will-download',(_event,item)=>{
      const row={name:item.getFilename(),state:'started',contents:''};globalThis.exportTestDownloads.push(row)
      const target=path.join(app.getPath('userData'),row.name);row.path=target;item.setSavePath(target)
      item.once('done',(_event,state)=>{row.state=state;if(state==='completed')row.contents=fs.readFileSync(target).toString('base64')})
    })
  })
  const manifest={...base,id:'test.playlist-export',name:'导出验收'}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const log=[];ctx.actions.register('log',()=>log);ctx.actions.register('release',()=>true);
    ctx.hooks.on('playlist.export',async(op,next)=>{log.push({input:op.input,source:op.source});if(op.input.playlist.name==='Export Cancel')op.preventDefault();else await next({...op.input,format:'cpl'})});
  }`
  const owner=await page.evaluate(async code=>{const result=await window.ceruQa.plugins.addPlugin(code,'playlist-export.js');if(!result.pluginId)throw Error(result.error);await window.ceruQa.plugins.savePermissions(result.pluginId,['guard']);await window.ceruQa.plugins.setEnabled(result.pluginId,true);return result.pluginId},code)
  await until(names,list=>list.includes('playlist.export'))
  await page.evaluate(async()=>{
    for(const name of ['Export Cancel','Export Format']) {
      const created=await window.ceruQa.songList.create(name,'private description','local')
      if(!created.success)throw Error(created.error)
      const result=await window.ceruQa.songList.addSongs(created.data.id,[{source:'qa',songmid:'one',name:'Exported song',singer:'QA',types:[],_types:{},typeUrl:{}}])
      if(!result.success)throw Error(result.error)
    }
    location.hash='/home/songlist'
  })
  await page.getByRole('button',{name:'刷新',exact:true}).click()
  const exportCard=async name=>{
    const card=page.locator('.playlist-card').filter({has:page.locator('.playlist-name-text',{hasText:name})})
    await card.click({button:'right'})
    await page.getByText('导出歌单',{exact:true}).click()
  }
  const log=()=>page.evaluate(id=>window.ceruQa.plugins.openPlaylistImportMenu(id,'log'),owner)
  const downloads=()=>application.evaluate(()=>globalThis.exportTestDownloads)
  await exportCard('Export Cancel');await until(log,rows=>rows.length===1);assert.deepEqual(await downloads(),[])
  await exportCard('Export Format');let rows=await until(downloads,rows=>rows.length===1 && rows[0].state==='completed')
  assert.equal(rows[0].name,'CeruMusic-Export Format.cpl')
  const decode=(row,compressed)=>JSON.parse(CryptoJS.AES.decrypt(compressed?gunzipSync(Buffer.from(row.contents,'base64')).toString():Buffer.from(row.contents,'base64').toString(),'CeruMusic-PlaylistSecretKey').toString(CryptoJS.enc.Utf8))
  assert.equal(decode(rows[0],false)[0].name,'Exported song')
  const recorded=await log();assert.equal(recorded.length,2);assert.equal(JSON.stringify(recorded).includes('Exported song'),false);assert.equal(JSON.stringify(recorded).includes('private description'),false)
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,[]),owner);await until(names,list=>!list.includes('playlist.export'))
  await exportCard('Export Format');rows=await until(downloads,rows=>rows.length===2 && rows[1].state==='completed')
  assert.equal(rows[1].name,'CeruMusic-Export Format.cmpl');assert.equal(decode(rows[1],true)[0].name,'Exported song');assert.deepEqual(await log(),recorded)
  for (const file of rows) {
    const existing=await page.evaluate(async()=> (await window.ceruQa.songList.getAll()).data.map(item=>item.id))
    await page.locator('input[type="file"][accept=".cmpl,.cpl"]').setInputFiles(file.path)
    const imported=await until(()=>page.evaluate(async ids=>(await window.ceruQa.songList.getAll()).data.filter(item=>!ids.includes(item.id)),existing),items=>items.length===1)
    const tracks=await page.evaluate(async id=>(await window.ceruQa.songList.getSongs(id)).data,imported[0].id)
    assert.equal(tracks.length,1);assert.equal(tracks[0].name,'Exported song');assert.equal(tracks[0].source,'qa')
  }
  console.log('Playlist export: cancel produced no download; cpl rewrite and default cmpl saved and imported through the real file input; hooks saw no songs or private description.')
}

async function verifyPlaylistTracks(page, base, until, names) {
  const manifest = {...base,id:'test.playlist-track-edits',name:'歌曲增删验收'}
  const code = 'exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const log=[];let release, cancelBulk=true;
    ctx.actions.register('log',()=>log);ctx.actions.register('release',()=>{if(release){release();release=null}else cancelBulk=false;return true});
    for(const name of ['playlist.addTracks','playlist.removeTracks'])ctx.hooks.on(name,async(op,next)=>{
      log.push({name,input:op.input,source:op.source});
      if(op.input.tracks.length>1){if(name==='playlist.removeTracks' && cancelBulk)op.preventDefault();else await next({...op.input,tracks:op.input.tracks.filter(track=>track.title!=='Keep')});return}
      if(op.input.tracks[0].title==='Keep')op.preventDefault();
      else {if(name==='playlist.removeTracks')await new Promise(resolve=>{release=resolve});await next()}
    })}`
  const owner = await page.evaluate(async code=>{const result=await window.ceruQa.plugins.addPlugin(code,'playlist-track-edits.js');if(!result.pluginId)throw Error(result.error);await window.ceruQa.plugins.savePermissions(result.pluginId,['guard']);await window.ceruQa.plugins.setEnabled(result.pluginId,true);return result.pluginId},code)
  await until(names, list=>list.includes('playlist.addTracks') && list.includes('playlist.removeTracks'))
  const [source,target] = await page.evaluate(async()=>{
    const api=window.ceruQa.songList, ids=[]
    for(const title of ['Track source','Track target']) {const result=await api.create(title,'','local');if(!result.success)throw Error(result.error);ids.push(result.data.id)}
    const result=await api.addSongs(ids[0],['Keep','Move'].map(name=>({source:'local',songmid:'private-'+name,name,singer:'QA',interval:'00:10',albumName:'QA',types:[],_types:{},typeUrl:{}})))
    if(!result.success)throw Error(result.error);return ids
  })
  const read=id=>page.evaluate(async id=>(await window.ceruQa.songList.getSongs(id)).data.map(song=>song.name).sort(),id)
  const action=id=>page.evaluate(([owner,id])=>window.ceruQa.plugins.openPlaylistImportMenu(owner,id),[owner,id])
  const open=(id,title)=>page.evaluate(([id,title])=>{location.hash='/home/list/'+encodeURIComponent(id)+'?type=local&source=local&title='+encodeURIComponent(title)},[id,title])
  const row=(name,title='Track source')=>page.locator('.list-container').filter({has:page.getByRole('heading',{name:title,exact:true})}).locator('.song-item').filter({hasText:name})
  const add=async name=>{
    await row(name).click({button:'right'});await page.getByText('加入歌单',{exact:true}).hover()
    await page.locator('.context-menu:visible').getByText('Track target',{exact:true}).click()
  }
  await open(source,'Track source');await add('Keep');await until(()=>action('log'),calls=>calls.length===1)
  assert.deepEqual(await read(target),[])
  await add('Move');await until(()=>read(target),list=>list.join()==='Move')
  await row('Move').click({button:'right'});await page.getByText('移出当前歌单',{exact:true}).click();await until(()=>action('log'),calls=>calls.length===3)
  await open(target,'Track target');await row('Move','Track target').waitFor();await action('release')
  await until(()=>read(source),list=>list.join()==='Keep');assert.deepEqual(await read(target),['Move']);await row('Move','Track target').waitFor()
  const calls=await action('log');assert.equal(calls[2].input.playlist.id,source);assert.equal(calls[2].source.location,'playlist-detail')
  assert.equal(calls[0].input.playlist.id,target);assert.equal(calls[0].source.location,'song-list');assert.ok(calls.every(call=>call.input.tracks[0].ref.providerId==='private'));assert.ok(!JSON.stringify(calls).includes('private-Move'))
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,[]),owner);await until(names,list=>!list.includes('playlist.addTracks'))
  await open(source,'Track source');await add('Keep');await until(()=>read(target),list=>list.join()==='Keep,Move');assert.deepEqual(await action('log'),calls)
  console.log('Playlist track menus: canceled add, permitted add, private handles, delayed removal across route change and revoked fast path verified in temporary storage.')
  await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['guard']),owner);await until(names,list=>list.includes('playlist.removeTracks'))
  await open(target,'Track target')
  const panel=page.locator('.list-container').filter({has:page.getByRole('heading',{name:'Track target',exact:true})})
  await panel.locator('.local-btn.more').hover();await page.getByText('批量选择',{exact:true}).click()
  await panel.getByText('全选',{exact:true}).click();assert.equal(await panel.locator('.selected-info').innerText(),'已选 2 首')
  await panel.getByRole('button',{name:'加入歌单'}).click();await page.locator('.t-dropdown__item:visible').getByText('Track source',{exact:true}).click()
  await until(()=>read(source),list=>list.join()==='Keep,Move')
  const remove=panel.getByRole('button',{name:'移除所选歌曲'})
  await remove.click();await until(()=>action('log'),log=>log.at(-1).name==='playlist.removeTracks' && log.at(-1).input.tracks.length===2)
  assert.deepEqual(await read(target),['Keep','Move']);assert.equal(await panel.locator('.selected-info').innerText(),'已选 2 首')
  await action('release');await remove.click();await until(()=>read(target),list=>list.join()==='Keep')
  await until(()=>panel.locator('.selected-info').innerText(),text=>text==='已选 1 首')
  console.log('Batch menus: canceled removal retains checks; filtered removal keeps the remaining row selected.')
  await verifyPluginPlaylistWriters(page,base,read,action)
}

async function verifyPluginPlaylistWriters(page,base,read,logAction) {
  for(const version of [2,3]) {
    const id='test.playlist-writer-v'+version, commands=['add','remove','cancel'], permissions=[{key:'write',name:'library.write',reason:'临时歌单验收'},{key:'delete',name:'library.delete',reason:'临时歌单验收'}]
    const actions=commands.map(id=>({id,title:id})), menus=commands.map(id=>({id,title:id,slot:'playlist.import',commandId:id}))
    const manifest=version===3 ? {...base,id,name:id,uses:{permissions},provides:{actions},ui:{menus}} : {manifestVersion:2,id,name:id,version:'1.0.0',engines:{hostApi:'^2.0.0',logicRuntime:'ceru-js@1'},modules:{logic:{entry:'logic.main'}},contributes:{commands:actions.map(action=>({...action,action:action.id})),menus},permissions}
    const title='Writer '+version
    const target=await page.evaluate(async version=>{const result=await window.ceruQa.songList.create('Writer target '+version,'','local');if(!result.success)throw Error(result.error);return result.data.id},version)
    const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
      const target={id:${JSON.stringify(target)},location:'local'}, items=['Keep',${JSON.stringify(title)}].map(title=>({ref:{kind:'track',providerId:'qa',scope:'provider',id:title.replace(' ','-')},title,metadata:{artists:['QA']},capabilities:[]}));
      ctx.actions.register('add',(_input,operation)=>ctx.library.playlists.import({target,items,requestId:'add-once',permissionKey:'write',operation}));
      ctx.actions.register('cancel',(_input,operation)=>ctx.library.playlists.import({target,items:items.slice(0,1),requestId:'cancel-once',permissionKey:'write',operation}));
      ctx.actions.register('remove',(_input,operation)=>ctx.library.playlists.removeTracks({target,items,permissionKey:'delete',operation}));
    }`
    const owner=await page.evaluate(async code=>{const row=await window.ceruQa.plugins.addPlugin(code,'playlist-writer.js');if(!row.pluginId)throw Error(row.error);await window.ceruQa.plugins.savePermissions(row.pluginId,['write','delete']);await window.ceruQa.plugins.setEnabled(row.pluginId,true);return row.pluginId},code)
    const call=name=>page.evaluate(([owner,name])=>window.ceruQa.plugins.openPlaylistImportMenu(owner,name),[owner,name])
    const before=(await logAction('log')).length, first=await call('add')
    assert.equal(first.cancelled,false);assert.equal(first.added,1);assert.equal(first.skipped,1);assert.deepEqual(await read(target),[title])
    assert.deepEqual(await call('add'),first);assert.equal((await logAction('log')).length,before+1)
    assert.equal((await call('cancel')).cancelled,true);assert.deepEqual(await read(target),[title])
    if(version===2) {await assert.rejects(call('remove'),/removeTracks is not a function/);assert.deepEqual(await read(target),[title])}
    else {assert.deepEqual(await call('remove'),{removed:1,notFound:1});assert.deepEqual(await read(target),[])}
    const calls=(await logAction('log')).slice(before);assert.equal(calls.length,version===2?2:3);assert.ok(calls.every(call=>call.source.kind==='plugin' && call.source.pluginId===id && call.source.runtime===version))
    console.log('v'+version+' writer: persisted addition, exact counts, cancellation, import dedupe and source verified; '+(version===2?'frozen worker lacks removeTracks; row unchanged.':'removal persisted.'))
  }
}
