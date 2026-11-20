import assert from 'node:assert/strict'

export async function verifyShuffle(page, baseUrl) {
  const actions = ['prepare','random','sequence','single','log','state','queue','ends','extend','play-tail','random-tail']
  const permissions = {listen:'music.control',control:'player.control',read:'player.read',intercept:'player.intercept'}
  const manifest = {manifestVersion:3,id:'test.shuffle',name:'Shuffle QA',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},
    provides:{providers:[{id:'shuffletest',name:'Shuffle QA',protocols:['music.search@1','music.resolve@1']}],actions:actions.map(id=>({id,title:id}))},
    ui:{menus:actions.map(id=>({id,title:id,slot:'playlist.import',commandId:id}))},uses:{permissions:Object.entries(permissions).map(([key,name])=>({key,name,reason:'Shuffle playback QA'}))}}
  const code = 'exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    const calls=[],ref=id=>({kind:'track',providerId:'shuffletest',id,scope:'provider'});
    const ends=[];let extend=false, forceTail=false;
    ctx.hooks.on('player.queueEnded',op=>{ends.push({source:op.source,input:op.input});if(!extend)op.preventDefault();else if(ends.length===2)return {tracks:[{ref:ref('d'),title:'Continuation D',metadata:{artists:['QA']}}]}});
    ctx.actions.register('ends',()=>ends);
    ctx.actions.register('extend',()=>{extend=true;return true});
    ctx.actions.register('random-tail',()=>{forceTail=true;extend=false;return true});
    ctx.actions.register('play-tail',async(_,operation)=>{await ctx.music.play(ref('b'),{permissionKey:'listen',operation});return true});
    ctx.providers.register('shuffletest',{tracks:{search:async()=>({items:['a','b','c'].map(id=>({ref:ref(id),title:id,metadata:{artists:['QA']},capabilities:['play']}))}),resolve:async item=>({ok:true,url:${JSON.stringify(baseUrl)}+'?shuffle='+item.id})}});
    ctx.hooks.on('queue.shuffle',async(op,next)=>{calls.push({source:op.source,ids:op.input.items.map(item=>item.ref.id)});await next({items:[...op.input.items].sort((left,right)=>forceTail ? ['a','d','c','b'].indexOf(left.ref.id)-['a','d','c','b'].indexOf(right.ref.id) : right.ref.id.localeCompare(left.ref.id))})});
    ctx.actions.register('prepare',async(_,operation)=>{const options={permissionKey:'listen',operation};await ctx.music.play(ref('c'),options);await ctx.music.enqueue([ref('a'),ref('b')],'end',options);return true});
    for(const mode of ['random','sequence','single'])ctx.actions.register(mode,async(_,operation)=>{await ctx.player.setMode(mode==='random'?{shuffle:true}:{repeat:mode==='single'?'one':'all'},{operation,permissionKey:'control'});return true});
    ctx.actions.register('state',(_,operation)=>ctx.player.getState({operation,permissionKey:'read'}));
    ctx.actions.register('queue',(_,operation)=>ctx.queue.get({operation,permissionKey:'read'}));
    ctx.actions.register('log',()=>calls);
  }`
  const installed = await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'shuffle.js'),code)
  assert.ok(installed.pluginId,installed.error)
  const owner = installed.pluginId
  const grant = keys=>page.evaluate(([owner,keys])=>window.ceruQa.plugins.savePermissions(owner,keys),[owner,keys])
  const action = name=>page.evaluate(([owner,name])=>window.ceruQa.plugins.openPlaylistImportMenu(owner,name),[owner,name])
  const waitTrack = async id=>{
    try {
      const deadline = Date.now()+15000
      while (Date.now()<deadline) {
        const matches = await page.evaluate(async ([owner,id])=>{
          const state = await window.ceruQa.plugins.openPlaylistImportMenu(owner,'state')
          return state?.track?.ref.id===id && Array.from(document.querySelectorAll('audio')).some(audio=>!audio.paused && audio.currentTime>0 && Math.abs(audio.duration-({a:29,b:2,c:30,d:4}[id]))<0.02)
        },[owner,id])
        if (matches) return
        await new Promise(resolve=>setTimeout(resolve,100))
      }
      throw Error('Expected audible shuffle track '+id)
    }
    catch (error) {
      console.error('Shuffle diagnostic:',id,await action('log'),await action('state'),await page.evaluate(()=>({audio:Array.from(document.querySelectorAll('audio')).map(audio=>[audio.currentSrc,audio.paused,audio.currentTime]),messages:Array.from(document.querySelectorAll('.t-message')).map(node=>node.textContent)})))
      throw error
    }
  }
  await grant(Object.keys(permissions))
  await page.evaluate(owner=>window.ceruQa.plugins.setEnabled(owner,true),owner)
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(snapshot=>snapshot.names.includes('queue.shuffle')))
  await action('prepare')
  await waitTrack('c')
  const queue = (await action('queue')).items.map(item=>item.ref.id)
  assert.deepEqual(queue,['c','a','b'])
  await action('random')
  const next = page.locator('button:has(.icon-xiayishou):visible').first()
  await next.click()
  await waitTrack('b')
  await waitTrack('a')
  const calls = await action('log')
  assert.ok(calls.length>0 && calls.every(({source})=>source.kind==='system' && source.location==='playback'))
  await next.click()
  await waitTrack('c')
  assert.ok((await action('log')).length>calls.length)
  assert.deepEqual((await action('queue')).items.map(item=>item.ref.id),queue)
  await grant(['listen','control','read'])
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(snapshot=>!snapshot.names.includes('queue.shuffle')))
  const revoked = await action('log')
  await action('sequence')
  await action('random')
  await next.click()
  assert.deepEqual(await action('log'),revoked)
  console.log('Shuffle worker ordered manual next, natural ending and wrap; visible queue unchanged and revoked hook not called.')
  assert.deepEqual(await action('ends'),[])
  await action('sequence')
  await grant(Object.keys(permissions))
  await page.waitForFunction(()=>window.ceruQa.plugins.hookSnapshot().then(snapshot=>snapshot.names.includes('player.queueEnded')))
  await action('play-tail')
  await waitTrack('b')
  const end = {source:{kind:'system',location:'playback'},input:{}}
  const waitEnds = async count=>{
    const deadline = Date.now()+10000
    let endings = await action('ends')
    while (endings.length<count && Date.now()<deadline) {
      await new Promise(resolve=>setTimeout(resolve,100))
      endings = await action('ends')
    }
    assert.deepEqual(endings,Array(count).fill(end),JSON.stringify({state:await action('state'),queue:(await action('queue')).items.map(item=>item.ref.id),ends:endings}))
  }
  await waitEnds(1)
  const stopped = await action('state')
  assert.equal(stopped.track.ref.id,'b')
  assert.equal(stopped.status,'paused')
  assert.ok(await page.evaluate(()=>Array.from(document.querySelectorAll('audio')).some(audio=>audio.ended && audio.duration===2)))
  await next.click();await waitTrack('c')
  assert.deepEqual(await action('ends'),[end])
  await action('extend');await action('play-tail');await waitTrack('b');await waitTrack('d')
  assert.deepEqual((await action('queue')).items.map(item=>item.ref.id),['c','a','b','d'])
  assert.deepEqual(await action('ends'),[end,end])
  await waitTrack('c')
  assert.deepEqual(await action('ends'),[end,end,end])
  console.log('Natural queue end cancelled the wrap, appended and played a new provider track, then passed through to the original loop. Manual wrap did not trigger it.')
  await action('random-tail');await action('random');await next.click();await waitTrack('b');await waitEnds(4)
  assert.deepEqual((await action('queue')).items.map(item=>item.ref.id),['c','a','b','d'])
  await action('single');await action('play-tail');await waitTrack('b')
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('audio')).some(audio=>audio.duration===2 && audio.ended),undefined,{timeout:8000})
  await waitTrack('b');assert.deepEqual(await action('ends'),Array(4).fill(end))
  console.log('Random queue end used the shuffled tail, not the visible tail; single-song repeat did not notify queue end.')
}
