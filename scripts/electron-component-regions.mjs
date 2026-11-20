import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function verifyComponentRegions(application, page, directory) {
  const names = ['lyrics', 'artwork', 'background', 'visualizer']
  const manifest = {
    manifestVersion:3,id:'test.shared-regions',name:'共享区域验收',version:'1.0.0',
    engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},
    entry:{logic:{module:'main'},views:names.map(name=>({id:name,kind:'component',module:'view.'+name}))},
    ui:{regions:names.map(name=>({region:'player.'+name,view:name})),skins:[{id:'shared',title:'共享区域验收',regions:names.map(name=>'player.'+name)}]}
  }
  const factory=`function(deps){const entry=function(bridge){
    const region=bridge.region,element=bridge.root.host;
    element.qaClock=region.props.currentTime;
    element.qaPlaying=region.props.playing;
    element.qaSpectrum=()=>region.props.spectrum;
    let frames=0;
    const View=deps.vue.defineComponent({setup(){
      deps.sdk.useFrame(()=>{
        if(element.dataset.mode==='throw')throw Error('QA direct frame failure');
        if(element.dataset.mode==='slow'){const end=performance.now()+40;while(performance.now()<end){}}
        element.dataset.frames=String(++frames);
        element.dataset.time=String(region.props.currentTime.value);
        element.dataset.peak=String(region.props.spectrum?Math.max(...region.props.spectrum):0);
        element.dataset.title=region.props.track?.title||'';
        element.dataset.width=String(region.size.value.width);
      });
      return ()=>region.name==='player.visualizer'?deps.vue.h(bridge.components.AudioVisualizer,{playing:region.props.playing.value,color:'#ff00ff',barCount:24,height:64}):
        region.name==='player.artwork'?deps.vue.h(bridge.components.SquareCover,{artwork:region.props.artwork,playing:region.props.playing.value}):
        region.name==='player.lyrics'?deps.vue.h(bridge.components.LyricAdapter,{onLineClick:region.actions.seek}):
        deps.vue.h('div',{style:{height:'100%',background:'#123456'}});
    }});
    return deps.sdk.mountComponent(View,bridge);
  };entry.onEnter=({root,reason})=>{root.host.dataset.enter=reason};
  entry.onLeave=({root,signal,reason})=>{
    root.host.dataset.leave=reason;
    if(root.host.dataset.hang==='true')return new Promise(resolve=>{
      const start=performance.now();signal.addEventListener('abort',()=>{root.host.dataset.abortMs=String(performance.now()-start);resolve()},{once:true});
    });
  };return entry;}`
  const code='exports.manifest='+JSON.stringify(manifest)+';exports.activate=()=>{};exports.modules={'+names.map(name=>JSON.stringify('view.'+name)+':'+factory).join(',')+'};'
  const added=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'shared-regions.js'),code)
  assert.ok(added.pluginId,added.error)
  await writeFile(join(directory,'profile','transport.lrc'),'[00:00.00]第一行\n[00:10.00]第二行\n')
  await application.evaluate(({app,BrowserWindow})=>{
    const {MusicDatabase}=globalThis.runtimeTestRequire('./databases.cjs')
    new MusicDatabase().upsertTrack({songmid:'shared-qa',path:globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'),'transport.wav'),url:null,singer:'QA',name:'共享时钟验收',albumName:'本地专辑',albumId:0,source:'local',interval:'00:30',hasCover:0,coverKey:null,year:2026,lrc:'[00:00.00]第一行\n[00:10.00]第二行',types:'[]',_types:'{}',typeUrl:'{}',bitrate:705600,sampleRate:44100,channels:1,duration:30,size:2646044,mtime_ms:1,hash:null,updated_at:Date.now()})
    for(const window of BrowserWindow.getAllWindows())window.webContents.setAudioMuted(true)
  })
  try {
    const enabled=await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,true),added.pluginId)
    assert.equal(enabled.error,undefined)
    await page.reload({waitUntil:'domcontentloaded'})
    await page.getByText('共享时钟验收', { exact: true }).first().waitFor()
    await page.waitForFunction(()=>window.musicEmitter?.all?.get('replacePlaylist')?.length > 0)
    await page.getByRole('button',{name:'播放全部'}).click()
    try { await page.waitForFunction(()=>Array.from(document.querySelectorAll('audio')).some(audio=>audio.currentSrc.includes('transport.wav')&&!audio.paused),null,{timeout:10000}) }
    catch(error) {
      console.error('Playback diagnostic:', await page.evaluate(()=>({text:document.body.innerText.slice(-3000),audio:Array.from(document.querySelectorAll('audio')).map(a=>({src:a.currentSrc,paused:a.paused,time:a.currentTime,error:a.error?.message}))})))
      throw error
    }
    await page.locator('.player-container').dispatchEvent('click')
    await page.locator('.full-play.active .skin-btn').press('Enter')
    await page.getByRole('button',{name:'共享区域验收',exact:true}).click()
    await page.getByRole('button',{name:'关闭个性化面板'}).press('Escape')
    await page.waitForFunction(()=>['lyrics','artwork','background','visualizer'].every(name=>Number(document.querySelector('.plugin-'+name+' .component-root')?.dataset.frames)>5))
    assert.equal(await page.locator('.full-play.active iframe').count(),0)
    await page.waitForFunction(()=>Number(document.querySelector('.plugin-visualizer .component-root')?.dataset.peak)>0)
    const evidence=await page.evaluate(()=>{
      const roots=['lyrics','artwork','background','visualizer'].map(name=>document.querySelector('.plugin-'+name+' .component-root'))
      return {sameClock:roots.every(root=>root.qaClock===roots[0].qaClock),samePlaying:roots.every(root=>root.qaPlaying===roots[0].qaPlaying),
        sameSpectrum:roots[2].qaSpectrum()===roots[3].qaSpectrum(),frames:roots.map(root=>Number(root.dataset.frames)),
        times:roots.map(root=>Number(root.dataset.time)),title:roots[0].dataset.title,closed:roots.every(root=>root.shadowRoot===null)}
    })
    assert.equal(evidence.sameClock,true)
    assert.equal(evidence.samePlaying,true)
    assert.equal(evidence.sameSpectrum,true)
    assert.equal(evidence.closed,true)
    assert.equal(evidence.title,'共享时钟验收')
    assert.ok(Math.max(...evidence.times)-Math.min(...evidence.times)<100)
    const protocol=await page.context().newCDPSession(page)
    try {
      await protocol.send('DOM.enable')
      const tree=(await protocol.send('DOM.getDocument',{depth:-1,pierce:true})).root
      const elements=[]
      const collect=node=>{elements.push(node);for(const child of [...(node.children||[]),...(node.shadowRoots||[])])collect(child)}
      collect(tree)
      const classes=node=>{const index=node.attributes?.indexOf('class');return index>=0?node.attributes[index+1]:''}
      assert.ok(elements.some(node=>node.nodeName==='CANVAS'&&classes(node).includes('visualizer-canvas')),'Actual host spectrum canvas')
      assert.ok(elements.some(node=>classes(node).includes('lyric-scroll-container')),'Actual host lyric component')
      const text = node => (node.nodeValue || '') + (node.children || []).map(text).join('')
      const line = elements.find(node=>node.attributes?.includes('data-lyric-index') && text(node).trim()==='第二行')
      assert.ok(line,'Second timed lyric')
      await protocol.send('DOM.focus',{backendNodeId:line.backendNodeId})
      await page.keyboard.press('Enter')
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('audio')).some(audio=>audio.currentSrc.includes('transport.wav')&&Math.abs(audio.currentTime-10)<1),null,{timeout:5000})
    }finally{await protocol.detach()}
    const artwork=page.locator('.plugin-artwork .component-root')
    const originalWidth=Number(await artwork.getAttribute('data-width'))
    await application.evaluate(({webContents})=>{const w=webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow();const b=w.getBounds();globalThis.qaRegionBounds=b;w.setBounds({...b,width:b.width+120})})
    await page.waitForFunction(width=>Number(document.querySelector('.plugin-artwork .component-root')?.dataset.width)!==width,originalWidth)
    await application.evaluate(({webContents})=>webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow().setBounds(globalThis.qaRegionBounds))
    const focusProtocol=await page.context().newCDPSession(page)
    try {
      await focusProtocol.send('Emulation.setFocusEmulationEnabled',{enabled:false})
      await application.evaluate(({webContents})=>webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow().blur())
      await page.waitForFunction(()=>!document.hasFocus())
      const pausedFrames=await artwork.getAttribute('data-frames')
      await page.waitForTimeout(200)
      assert.equal(await artwork.getAttribute('data-frames'),pausedFrames,'Blurred region kept rendering')
      await application.evaluate(({webContents})=>webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow().focus())
      await page.waitForFunction(previous=>Number(document.querySelector('.plugin-artwork .component-root')?.dataset.frames)>Number(previous),pausedFrames)
    } finally {await focusProtocol.send('Emulation.setFocusEmulationEnabled',{enabled:true});await focusProtocol.detach()}
    const trigger=page.getByRole('button',{name:'播放器个性化',exact:true})
    await trigger.press('Enter')
    const retained=await artwork.elementHandle()
    await retained.evaluate(element=>{element.dataset.hang='true'})
    await page.getByRole('button',{name:'经典黑胶',exact:true}).click()
    await artwork.waitFor({state:'detached'})
    const aborted=await retained.evaluate(element=>Number(element.dataset.abortMs))
    assert.ok(aborted>=550 && aborted<1000,'Hanging transition timeout: '+aborted)
    await retained.dispose()
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.getByRole('button',{name:'共享区域验收',exact:true}).click()
    await artwork.waitFor()
    assert.equal(await artwork.getAttribute('data-enter'),null,'Reduced motion ran an entry animation')
    await page.emulateMedia({reducedMotion:'no-preference'})
    await page.getByRole('button',{name:'关闭个性化面板'}).press('Escape')
    const anchor=await trigger.boundingBox()
    await artwork.evaluate(element=>{element.dataset.mode='slow'})
    await page.locator('.health-summary').getByText('皮肤显示不够流畅').waitFor({timeout:6000})
    assert.deepEqual(await trigger.boundingBox(),anchor,'Performance notice displaced personalization')
    await artwork.evaluate(element=>{delete element.dataset.mode})
    await page.locator('.health-summary').waitFor({state:'detached',timeout:4000})
    const lyrics=page.locator('.plugin-lyrics .component-root')
    await lyrics.evaluate(element=>{element.dataset.mode='throw'})
    await lyrics.waitFor({state:'detached'})
    assert.equal(await artwork.count(),1,'One failed region removed a healthy region')
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('audio')].find(a=>a.currentSrc.includes('transport.wav'))?.paused),false)
    await page.evaluate(()=>{const audio=[...document.querySelectorAll('audio')].find(a=>a.currentSrc.includes('transport.wav'));audio.currentTime=0})
    await artwork.evaluate(element=>{element.dataset.mode='slow'})
    await artwork.waitFor({state:'detached',timeout:14000})
    assert.equal(await page.locator('.plugin-background .component-root').count(),1,'Sustained slowness removed a healthy sibling')
    await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,false),added.pluginId)
    await page.waitForFunction(()=>!document.querySelector('.full-play.active .component-root'))
    const playback=await page.evaluate(()=>Array.from(document.querySelectorAll('audio')).find(audio=>audio.currentSrc.includes('transport.wav'))?.paused)
    assert.equal(playback,false)
    console.log(JSON.stringify({directRegions:true,...evidence,resize:true,focusPause:true,transitionTimeoutMs:Math.round(aborted),reducedMotion:true,frameWarningAndRecovery:true,sustainedSlowFallback:true,stablePersonalization:true,errorFallback:true,disableRestoresDefault:true,audioContinues:true}))
  }finally{await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),added.pluginId)}
}
