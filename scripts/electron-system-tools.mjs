import assert from 'node:assert/strict'

export async function verifySystemTools(application,page,interceptor,hookAction,until) {
  console.log('System tools: installing independent caller')
  const commands=['notice','link','unsafe','close','tools']
  const manifest={manifestVersion:3,id:'test.system-tools',name:'系统调用验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},
    provides:{actions:commands.map(id=>({id,title:id}))},ui:{menus:commands.map(id=>({id,title:id,slot:'playlist.import',commandId:id}))},
    uses:{permissions:[{key:'external',name:'external.open',reason:'测试公开链接调用'},{key:'window',name:'window.control',reason:'测试窗口关闭调用'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    ctx.actions.register('tools',()=>ctx.app.operations.list());
    const inputs={notice:['notification.show',{title:'',body:'调用工具提示',level:'info'},''],link:['link.open',{url:'https://example.test/tool',from:'deeplink'},'external'],unsafe:['link.open',{url:'https://example.test/?access_token=private',from:'deeplink'},'external'],close:['window.close',{},'window']};
    for(const [name,[operation,input,permissionKey]] of Object.entries(inputs))ctx.actions.register(name,(_input,operationContext)=>ctx.app.call(operation,input,{permissionKey,operation:operationContext}));
  }`
  const owner=await page.evaluate(async code=>{const row=await window.ceruQa.plugins.addPlugin(code,'system-tools.js');if(!row.pluginId)throw Error(row.error);await window.ceruQa.plugins.setEnabled(row.pluginId,true);return row.pluginId},code)
  const call=async name=>{
    let timer
    try {return await Promise.race([
      page.evaluate(([id,name])=>window.ceruQa.plugins.openPlaylistImportMenu(id,name),[owner,name]),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('System tool timed out: '+name)),20000)})
    ])} finally {clearTimeout(timer)}
  }
  const grants=keys=>page.evaluate(([id,keys])=>window.ceruQa.plugins.savePermissions(id,keys),[owner,keys])
  const hooks=keys=>page.evaluate(([id,keys])=>window.ceruQa.plugins.savePermissions(id,keys),[interceptor,keys])
  const deny=async name=>{
    const result=call(name).then(value=>({value}),error=>({error:String(error)}))
    const prompt=page.locator('.t-dialog:visible').filter({has:page.locator('.grant-intro',{hasText:manifest.name})})
    await prompt.waitFor()
    await prompt.getByRole('button',{name:'取消',exact:true}).click()
    assert.match((await result).error,/permission|denied|权限|授权/i)
  }
  const records=async name=>(await hookAction('log')).filter(row=>row.name===name&&row.source?.pluginId===manifest.id)
  const dialog=page.locator('.t-dialog:visible').filter({hasText:'您希望如何处理关闭操作？'})
  const isVisible=()=>application.evaluate(({BrowserWindow})=>BrowserWindow.fromId(globalThis.runtimeTestMainId).isVisible())
  const show=()=>application.evaluate(({BrowserWindow})=>BrowserWindow.fromId(globalThis.runtimeTestMainId).show())
  try {
    const tools=await call('tools')
    assert.equal(tools.length,23)
    assert.equal(tools.find(row=>row.name==='notification.show').permission,null)
    assert.equal(tools.find(row=>row.name==='window.close').permission,'window.control')
    await hooks(['links','notices','window']);await hookAction('cancel')
    assert.equal(await call('notice'),null)
    assert.equal(await page.getByText('调用工具提示',{exact:true}).count(),0)
    assert.equal((await records('notification.show')).length,1)
    await hookAction('rewrite');assert.equal(await call('notice'),null)
    await page.getByText('已改写提示',{exact:true}).last().waitFor()
    console.log('System tools: notification cancellation and rewrite passed')
    await deny('link')
    await deny('close')
    assert.equal((await records('link.open')).length,0)
    assert.equal((await records('window.close')).length,0)
    await grants(['external','window'])
    await assert.rejects(call('unsafe'),/Invalid public link/)
    assert.equal((await records('link.open')).length,0)
    assert.equal(await call('link'),null)
    assert.equal((await records('link.open')).length,1)
    assert.deepEqual((await records('link.open'))[0].source,{kind:'plugin',pluginId:manifest.id,runtime:3})
    assert.equal(await call('close'),null)
    assert.equal((await records('window.close')).length,1)
    assert.equal(await dialog.count(),0)
    assert.equal(await isVisible(),true)
    console.log('System tools: link and window authorization/cancellation passed')
    await hookAction('hold')
    const pending=call('link').then(value=>({value}),error=>({error:String(error)}))
    await until(async()=>(await records('link.open')).length===2)
    await grants(['window'])
    await hookAction('release')
    assert.match((await pending).error,/permission|denied|abort|access|权限|授权|撤销/i)
    await deny('link')
    assert.equal((await records('link.open')).length,2)
    console.log('System tools: in-flight permission revocation passed')
    await grants(['external','window']);await hooks([])
    // Unknown public URLs fall through the existing recognizer without opening a browser.
    assert.equal(await call('link'),null)
    assert.equal((await records('link.open')).length,2)
    assert.equal(await call('notice'),null)
    await page.getByText('调用工具提示',{exact:true}).last().waitFor()
    assert.equal(await call('close'),null)
    await dialog.waitFor()
    console.log('System tools: default close dialog opened')
    await dialog.locator('.t-dialog__close').click()
    await until(async()=>await dialog.count()===0)
    assert.equal(await call('close'),null)
    await dialog.waitFor()
    await dialog.getByRole('button',{name:/最小化到托盘/}).click()
    await until(async()=>!(await isVisible()))
    await show()
    await until(async()=>await dialog.count()===0)
    assert.equal(await call('close'),null)
    await until(async()=>!(await isVisible()))
    await show()
    await until(async()=>await dialog.count()===0)
    assert.equal((await records('window.close')).length,1)
    console.log('System tools: 23 schemas, permission-free notice cancel/rewrite, public-link validation, real plugin source, grant revocation during hooks, original link fallback and configured close-to-tray passed.')
  } finally {
    await show()
    await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),owner)
  }
}
