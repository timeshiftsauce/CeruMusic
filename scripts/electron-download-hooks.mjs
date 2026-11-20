import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {join} from 'node:path'

export async function verifyDownloadHooks(application,page,previewUrl) {
  const until=async read=>{
    const deadline=Date.now()+15000
    while(Date.now()<deadline) {
      const result=await read()
      if(result)return result
      await page.waitForTimeout(100)
    }
    throw Error('Timed out waiting for download state')
  }
  const directory=await application.evaluate(({app})=>globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'),'download-hook-qa'))
  const manifest={manifestVersion:3,id:'test.downloads',name:'下载处理验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},
    provides:{providers:[{id:'downloadqa',name:'下载测试',protocols:['music.resolve@1']}],actions:['log','tools'].map(id=>({id,title:id}))},
    ui:{menus:['log','tools'].map(id=>({id,title:id,slot:'playlist.import',commandId:id}))},uses:{permissions:[{key:'intercept',name:'downloads.intercept',reason:'下载测试'},{key:'create',name:'downloads.create',reason:'创建测试下载'},{key:'control',name:'player.control',reason:'队列测试'},{key:'read',name:'player.read',reason:'读取队列'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const log=[];ctx.actions.register('log',()=>log);
    ctx.actions.register('tools',async(_,operation)=>{
      const track={ref:{kind:'track',providerId:'downloadqa',id:'tool-download'},title:'Tool Download',metadata:{artists:['QA']}};
      const control={operation,permissionKey:'control'},read={operation,permissionKey:'read'};
      await ctx.app.call('queue.add',{tracks:[track],position:'end'},control);
      const added=(await ctx.queue.get(read)).items.length;
      await ctx.app.call('queue.remove',{tracks:[track]},control);
      const removed=(await ctx.queue.get(read)).items.length;
      await ctx.app.call('queue.add',{tracks:[track],position:'next'},control);
      const folder=await ctx.files.pickDirectory(operation);
      if(!folder)throw Error('No test folder');
      await ctx.app.call('download.create',{tracks:[track],quality:'wav',directory:folder.id},{operation,permissionKey:'create'});
      await ctx.app.call('queue.clear',{},control);
      return {added,removed,cleared:(await ctx.queue.get(read)).items.length};
    });
    ctx.providers.register('downloadqa',{tracks:{resolve:async()=>{log.push({name:'resolve'});return {ok:true,url:${JSON.stringify(previewUrl)}}}}});
    ctx.hooks.on('download.create',async(op,next)=>{log.push({name:'create',input:op.input,source:op.source});
      if(op.input.tracks[0]?.title==='cancel')op.preventDefault();
      else await next({...op.input,tracks:op.input.tracks.filter(track=>track.title!=='skip'),quality:'wav'});
    });
    ctx.hooks.on('download.filename',async(op,next)=>{log.push({name:'filename',input:op.input});
      if(op.input.track.title.startsWith('slow'))await new Promise(resolve=>setTimeout(resolve,1000));
      return {...op.input,name:'Renamed-'+op.input.name};
    });
  }`
  const owner=await page.evaluate(async code=>{const row=await window.ceruQa.plugins.addPlugin(code,'downloads.js');if(!row.pluginId)throw Error(row.error);await window.ceruQa.plugins.savePermissions(row.pluginId,['intercept','create']);await window.ceruQa.plugins.setEnabled(row.pluginId,true);return row.pluginId},code)
  const log=()=>page.evaluate(owner=>window.ceruQa.plugins.openPlaylistImportMenu(owner,'log'),owner)
  const tasks=names=>names.map(name=>({songInfo:{source:'downloadqa',songmid:name,name,singer:'QA',template:'%t',types:[{type:'wav'}]},quality:'128k',path:directory,tagWriteOptions:{},pluginId:owner}))
  const batch=(names,from)=>page.evaluate(({tasks,from})=>window.ceruQa.music.requestSdk('downloadBatchSongs',{source:'downloadqa',tasks,from}),{tasks:tasks(names),from})
  const single=name=>page.evaluate(task=>window.ceruQa.music.requestSdk('downloadSingleSong',{source:'downloadqa',...task}),tasks([name])[0])
  const waitForFile=async task=>{
    const row=await until(()=>page.evaluate(id=>window.ceruQa.download.getTasks().then(rows=>rows.find(row=>row.id===id&&['completed','failed'].includes(row.status))),task.id))
    assert.equal(row.status,'completed',JSON.stringify(row))
    assert.equal((await readFile(row.filePath)).subarray(0,4).toString(),'RIFF')
    return row
  }
  try {
    assert.deepEqual(await batch(['cancel']),[])
    // The visible undo must bypass both hooks, including filename rewriting.
    await page.getByRole('button',{name:'撤销本次',exact:true}).last().click()
    const undone=await until(()=>page.evaluate(()=>window.ceruQa.download.getTasks().then(rows=>rows.find(row=>row.songInfo.name==='cancel'))))
    await waitForFile(undone)
    assert.ok((await readdir(directory)).includes('cancel.wav'))
    const selected=await batch(['skip','keep'])
    assert.equal(selected.length,1)
    assert.equal(selected[0].quality,'wav')
    assert.equal((await waitForFile(selected[0])).filePath,join(directory,'Renamed-keep.wav'))
    const one=await single('single')
    assert.equal((await waitForFile(one)).filePath,join(directory,'Renamed-single.wav'))
    const entries=await log()
    assert.equal(entries.filter(row=>row.name==='resolve').length,3)
    assert.ok(!JSON.stringify(entries).includes(directory))
    assert.equal(entries.filter(row=>row.name==='create').length,3)
    assert.equal(entries.filter(row=>row.name==='filename').length,2)
    await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['create','intercept','control','read']),owner)
    await application.evaluate(({dialog},directory)=>{
      globalThis.originalToolFolderDialog=dialog.showOpenDialog
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]})
    },directory)
    try {
      const result=await page.evaluate(owner=>window.ceruQa.plugins.openPlaylistImportMenu(owner,'tools'),owner)
      assert.deepEqual(result,{added:1,removed:0,cleared:0})
      const task=await until(()=>page.evaluate(()=>window.ceruQa.download.getTasks().then(rows=>rows.find(row=>row.songInfo.name==='Tool Download'))))
      assert.equal((await waitForFile(task)).filePath,join(directory,'Renamed-Tool Download - QA.wav'))
    } finally {await application.evaluate(({dialog})=>{dialog.showOpenDialog=globalThis.originalToolFolderDialog})}
    const pending=batch(['slow'],owner)
    await until(()=>log().then(rows=>rows.some(row=>row.name==='filename'&&row.input.track.title==='slow')))
    await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['intercept']),owner)
    const revoked=await pending
    assert.equal(revoked.length,1)
    assert.equal(revoked[0].success,false)
    assert.equal((await page.evaluate(()=>window.ceruQa.download.getTasks())).some(row=>row.songInfo.name==='slow'),false)
    await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['create']),owner)
    assert.equal((await waitForFile(await single('original'))).filePath,join(directory,'original.wav'))
    await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['create','intercept']),owner)
    const stopped=batch(['slow-stop'],owner)
    await until(()=>log().then(rows=>rows.some(row=>row.name==='filename'&&row.input.track.title==='slow-stop')))
    await page.evaluate(owner=>window.ceruQa.plugins.setEnabled(owner,false),owner)
    const stoppedResult=await stopped
    assert.equal(stoppedResult[0].success,false)
    assert.equal((await page.evaluate(()=>window.ceruQa.download.getTasks())).some(row=>row.songInfo.name==='slow-stop'),false)
    console.log('Downloads: cancellation, undo, actual WAV files, hidden directory, revocation and stop passed; worker app.call added/removed/cleared the queue and downloaded through the same hooks.')
  } finally {await page.evaluate(owner=>window.ceruQa.plugins.uninstallPlugin(owner),owner)}
}
