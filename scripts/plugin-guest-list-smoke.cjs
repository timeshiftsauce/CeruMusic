const { app, BrowserWindow } = require('electron')
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { createServer } = require('node:http')
const assert = require('node:assert/strict')
app.whenReady().then(async () => {
  const root = await mkdtemp(join(tmpdir(), 'ceru-guest-list-'))
  app.setPath('userData', root)
  const { default: service, bindPluginUIWindow } = await import('../.plugin-lifecycle-smoke.mjs')
  const window = new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false}})
  bindPluginUIWindow(window)
  let failed = false
  const server = createServer((req,res) => res.end(`/** @name ${req.url === '/a' ? 'Fixture A' : 'Fixture B'}\n * @version 1.0.0 */
    lx.on(lx.EVENT_NAMES.request,async()=> 'https://example.test/audio.mp3');
    lx.send(lx.EVENT_NAMES.inited,{sources:{kw:{name:'酷我音乐',type:'music',actions:['musicUrl'],qualitys:['128k']}}});`))
  try {
    const page = join(root, 'bridge.html')
    await writeFile(page, `<script>require('electron').ipcRenderer.on('plugin:ui',(_,r)=>{window.lastPluginUI=r;require('electron').ipcRenderer.invoke('plugin:ui-result',{id:r.id,value:true})})</script>`)
    await window.loadFile(page)
    await window.webContents.executeJavaScript("require('electron').ipcRenderer.invoke('plugin:ui-ready',true)")
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    await service.initializePlugins()
    const parent = await service.addPlugin(await readFile('G:/code/pluginclitest/洛雪兼容环境/dist/plugin.js','utf8'),'fixture.js')
    await service.setActivePlugin(parent.pluginId)
    const host = service.getPluginById(parent.pluginId)
    const importMenu=host.getManifest().contributes.menus.find(m=>m.slot==='playlist.import')
    const command=host.getManifest().contributes.commands.find(c=>c.id===importMenu.commandId)
    await host.invokeV2Action(command.action,{})
    const ui=await window.webContents.executeJavaScript('window.lastPluginUI')
    assert.equal(ui.method,'ui.playlistImport.open')
    assert.equal(ui.pluginId,parent.pluginId)
    assert.equal(ui.data.title,'导入平台歌单')

    const url = `http://127.0.0.1:${server.address().port}`
    const a = await host.importGuest('lx',url+'/a')
    const b = await host.importGuest('lx',url+'/b')
    assert.equal((await service.listGuests(parent.pluginId)).length,2)
    assert.equal(a.selected,false)
    await service.setPluginEnabled(parent.pluginId,false)
    assert.equal((await service.listGuests(parent.pluginId)).length,2,'children remain listed while parent is closed')
    assert.equal(service.getPluginById(parent.pluginId),null,'listing does not execute parent')
    await service.selectGuest(parent.pluginId,a.id)
    assert.ok(service.getPluginById(parent.pluginId),'using a child starts its dependency')
    await Promise.all([service.selectGuest(parent.pluginId,b.id),service.selectGuest(parent.pluginId,a.id)])
    const guests = await service.listGuests(parent.pluginId)
    assert.equal(guests.filter(g=>g.selected).length,1)
    assert.equal(guests.filter(g=>g.state==='ready').length,1,'exactly one guest runtime remains')
    await service.setPluginEnabled(parent.pluginId,false)
    await service.removeGuest(parent.pluginId,b.id)
    assert.equal((await service.listGuests(parent.pluginId)).length,1,'dormant child can be removed without running parent')
    const started=Date.now()
    for(let i=0;i<8;i++){
      await service.setPluginEnabled(parent.pluginId,true)
      await service.getPluginsList()
      await service.listGuests(parent.pluginId)
      await service.setPluginEnabled(parent.pluginId,false)
      await service.getPluginsList()
      await service.listGuests(parent.pluginId)
    }
    console.log('Eight use/close cycles:',Date.now()-started,'ms')
    console.log('PASS: child listing after import/parent close, dependency activation, exclusive selection, dormant removal')
  } catch(error) {console.error(error);failed=true}
  finally {
    await service.disposeAll();window.destroy();await new Promise(resolve=>server.close(resolve));
    await rm(root,{recursive:true,force:true});app.exit(failed?1:0)
  }
}).catch(error=>{console.error(error);app.exit(1)})
