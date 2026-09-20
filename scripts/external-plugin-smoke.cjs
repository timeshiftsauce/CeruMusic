const {app}=require('electron')
const {mkdtemp,writeFile,rm}=require('node:fs/promises')
const {tmpdir}=require('node:os')
const {join}=require('node:path')
const assert=require('node:assert/strict')
app.whenReady().then(async()=>{
 const root=await mkdtemp(join(tmpdir(),'ceru-external-install-'));app.setPath('userData',root)
 const {default:service,prepareExternalPlugin,commitExternalPlugin,discardExternalPlugin,enqueueDeepLink,acknowledgeDeepLink}=await import('../.plugin-lifecycle-smoke.mjs')
 let failed=false
 try{
  await service.initializePlugins()
  const code='exports.manifest='+JSON.stringify({manifestVersion:2,id:'test.external',name:'外部插件',version:'1.0.0',engines:{hostApi:'^2.0.0',logicRuntime:'ceru-js@1'},modules:{logic:{entry:'logic.main'}}})+';exports.activate=async function(){throw Error("must not execute during installation")};'
  const file=join(root,'fixture.js');await writeFile(file,code)
  const request=enqueueDeepLink('plugin-file',file)
  const preview=await prepareExternalPlugin(request.sequence)
  assert.equal(preview.name,'外部插件');assert.equal((await service.getPluginsList()).length,0)
  discardExternalPlugin(request.sequence)
  await assert.rejects(commitExternalPlugin(request.sequence),/失效/)
  await prepareExternalPlugin(request.sequence)
  const installed=await commitExternalPlugin(request.sequence)
  assert.equal(service.getPluginById(installed.pluginId),null,'installation must not execute the plugin')
  acknowledgeDeepLink(request.sequence)
  await assert.rejects(prepareExternalPlugin(request.sequence),/失效/)
  service.downloadFile=async()=>code
  const link=enqueueDeepLink('plugin-link','cerumusic://plugin/add/link?url=https%3A%2F%2Fexample.test%2Fplugin.js&pluginId='+installed.pluginId)
  assert.equal((await prepareExternalPlugin(link.sequence)).update,true)
  const update=await commitExternalPlugin(link.sequence);assert.equal(update.pluginId,installed.pluginId)
  assert.equal(service.getPluginById(installed.pluginId),null)
  console.log('PASS: queued plugin-file/link preview, cancel, inert install/update and acknowledged-request rejection')
 }catch(error){console.error(error);failed=true}
 finally{await service.disposeAll();await rm(root,{recursive:true,force:true});app.exit(failed?1:0)}
}).catch(error=>{console.error(error);app.exit(1)})
