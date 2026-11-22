import assert from 'node:assert/strict'
import { verifySystemTools } from './electron-system-tools.mjs'

export async function verifySystemHooks(application,page) {
  const manifest={manifestVersion:3,id:'test.system-hooks',name:'链接与通知验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},
    provides:{actions:['log','toast','cancel','rewrite','hold','release'].map(id=>({id,title:id}))},ui:{menus:['log','toast','cancel','rewrite','hold','release'].map(id=>({id,title:id,slot:'playlist.import',commandId:id}))},
    uses:{permissions:[{key:'links',name:'links.intercept',reason:'测试链接处理'},{key:'notices',name:'notifications.intercept',reason:'测试提示处理'},{key:'window',name:'window.intercept',reason:'测试窗口处理'},{key:'observe',name:'notifications.read',reason:'观察提示完成'},{key:'player',name:'player.read',reason:'读取现场播放摘要'},{key:'route',name:'route.read',reason:'读取现场页面摘要'},{key:'account',name:'account.profile',reason:'读取现场账号摘要'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const log=[];let mode='cancel',release;ctx.actions.register('log',()=>log);
    for(const name of ['cancel','rewrite','hold'])ctx.actions.register(name,()=>{mode=name;return true});
    ctx.actions.register('release',()=>{if(release){release();release=null}return true});
    ctx.actions.register('toast',()=>{ctx.ui.toast({message:'原始提示',level:'info'});return true});
    ctx.hooks.on('link.open',async(op,next)=>{log.push({name:'link.open',input:op.input,source:op.source});if(mode==='hold'){await new Promise(resolve=>{release=resolve});await next()}else op.preventDefault()});
    ctx.hooks.on('window.close',op=>{log.push({name:'window.close',input:op.input,source:op.source});op.preventDefault()});
    ctx.hooks.on('notification.show',op=>{log.push({name:'notification.show',input:op.input,source:op.source,state:op.state,frozen:Object.isFrozen(op.state)&&(!op.state.route||Object.isFrozen(op.state.route))});if(mode==='cancel')op.preventDefault();else return {...op.input,body:'已改写提示',level:'success'}});
    ctx.events.on('notification.show',e=>{log.push({name:'notice-before',input:e.input,frozen:Object.isFrozen(e.input)});if(e.input.body==='事件取消')e.preventDefault()});
    ctx.events.on('notification.show:done',e=>log.push({name:'notice-done',...e,frozen:Object.isFrozen(e.input)&&Object.isFrozen(e.handledBy)}));
  }`
  const owner=await page.evaluate(async code=>{const row=await window.ceruQa.plugins.addPlugin(code,'system-hooks.js');if(!row.pluginId)throw Error(row.error);await window.ceruQa.plugins.savePermissions(row.pluginId,['links','notices']);await window.ceruQa.plugins.setEnabled(row.pluginId,true);return row.pluginId},code)
  const action=id=>page.evaluate(([owner,id])=>window.ceruQa.plugins.openPlaylistImportMenu(owner,id),[owner,id])
  const until=async predicate=>{const deadline=Date.now()+15000;while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,60))}throw Error('system hook expectation timed out')}
  const links=async()=>(await action('log')).filter(row=>row.name==='link.open')
  const paste=(text,input=false)=>page.evaluate(({text,input})=>{const target=input?document.createElement('input'):document.body;if(input)document.body.append(target);const data=new DataTransfer();data.setData('text/plain',text);const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});target.dispatchEvent(event);if(input)target.remove();return event.defaultPrevented},{text,input})
  try {
    await until(async()=> (await page.evaluate(()=>window.ceruQa.plugins.hookSnapshot())).names.includes('link.open'))
    assert.equal(await paste('https://example.test/playlist?id=1'),true)
    await until(async()=> (await links()).length===1)
    assert.equal((await links())[0].input.from,'paste')
    for(const url of ['https://example.test/?access_token=private','cerumusic://oauth/callback?code=private','cerumusic://plugin/add/link?url=https://example.test/plugin.js','https://example.test/one\nhttps://example.test/two'])assert.equal(await paste(url),false)
    assert.equal(await paste('https://example.test/editing',true),false)
    assert.equal((await links()).length,1)
    await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/uri-list','https://example.test/drop');document.body.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}))})
    await until(async()=> (await links()).length===2)
    assert.equal((await links())[1].input.from,'drop')
    await application.evaluate(({app})=>app.emit('open-url',{preventDefault(){}},'cerumusic://share/test-no-request'))
    await until(async()=> (await links()).length===3)
    assert.equal((await links())[2].input.from,'deeplink')
    await application.evaluate(({app})=>app.emit('open-url',{preventDefault(){}},'ceru://share/test-alias-no-request'))
    await until(async()=> (await links()).length===4)
    assert.equal((await links())[3].input.url,'cerumusic://share/test-alias-no-request')
    await action('toast')
    await until(async()=> (await action('log')).some(row=>row.name==='notification.show'))
    assert.equal(await page.getByText('原始提示',{exact:true}).count(),0)
    const notice=(await action('log')).find(row=>row.name==='notification.show')
    assert.deepEqual(notice.source,{kind:'plugin',pluginId:manifest.id,runtime:3})
    assert.deepEqual(notice.state,{player:null,route:null,account:null})
    assert.equal(notice.frozen,true)
    await action('rewrite');await action('toast')
    await page.getByText('已改写提示',{exact:true}).waitFor()
    await page.evaluate(()=>{location.hash='/home/songlist'})
    await page.locator('.page-header').getByRole('button',{name:'导入',exact:true}).click()
    await page.locator('.import-options .import-option').filter({hasText:'从播放列表'}).click()
    await until(async()=> (await action('log')).some(row=>row.name==='notification.show'&&row.input.body==='当前播放列表为空，无法导入'))
    assert.equal(await page.getByText('当前播放列表为空，无法导入',{exact:true}).count(),0)
    assert.equal((await action('log')).find(row=>row.name==='notification.show'&&row.input.body==='当前播放列表为空，无法导入').source.kind,'system')
    await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['links','notices','observe','player','route','account']),owner)
    await action('toast')
    await until(async()=> (await action('log')).findLast(row=>row.name==='notification.show')?.state?.route?.name==='songlist')
    const state=(await action('log')).findLast(row=>row.name==='notification.show').state
    assert.equal(state.player.status,'idle')
    assert.equal(state.player.track,null)
    assert.deepEqual(state.account,{loggedIn:false,profile:null})
    const done=(await action('log')).findLast(row=>row.name==='notice-done')
    assert.equal(done.input.body,'已改写提示');assert.equal(done.frozen,true)
    assert.deepEqual(done.handledBy,[manifest.id]);assert.equal(done.failed,false)
    assert.equal((await action('log')).find(row=>row.name==='notice-before').frozen,true)
    await page.evaluate(()=>window.ceruQa.plugins.hookControls({paused:true}))
    const beforeSafe=(await action('log')).length
    await action('toast')
    await until(async()=> (await action('log')).length>beforeSafe)
    const safe=(await action('log')).slice(beforeSafe)
    assert.deepEqual(safe.map(row=>row.name),['notice-done'])
    assert.equal(safe[0].input.body,'原始提示');assert.equal(safe[0].prevented,false)
    await page.evaluate(()=>window.ceruQa.plugins.hookControls({paused:false}))
    await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,['observe']),owner)
    await action('toast')
    await until(async()=> (await action('log')).findLast(row=>row.name==='notice-done')?.input.body==='原始提示')
    assert.deepEqual((await action('log')).findLast(row=>row.name==='notice-done').handledBy,[])
    await page.evaluate(owner=>window.ceruQa.plugins.savePermissions(owner,[]),owner)
    const count=(await action('log')).length
    await action('toast');await page.getByText('原始提示',{exact:true}).last().waitFor()
    assert.equal((await action('log')).length,count)
    console.log('System operations: explicit links, protected URLs, notification rewrite/revocation, permission-scoped state, immutable before/done events and safe-mode observers passed.')
    await verifySystemTools(application,page,owner,action,until)
  } finally {await page.evaluate(owner=>window.ceruQa.plugins.uninstallPlugin(owner),owner)}
}
