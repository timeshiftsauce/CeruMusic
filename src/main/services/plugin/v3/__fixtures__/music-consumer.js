exports.manifest = {
  manifestVersion: 3,
  id: 'test.music-consumer',
  name: '聚合验收',
  version: '1.0.0',
  engines: {
    hostApi: '^3.0.0',
    logicRuntime: 'ceru-js@1'
  },
  entry: {
    logic: {
      module: 'logic.main'
    }
  },
  provides: {
    actions: [
      { id: 'next', title: 'next' },
      { id: 'previous', title: 'previous' },
      { id: 'mode-sequence', title: 'mode-sequence' },
      { id: 'mode-random', title: 'mode-random' },
      { id: 'mode-single-muted', title: 'mode-single-muted' },
      { id: 'unmute', title: 'unmute' },
      { id: 'remove-early', title: 'remove-early' },
      { id: 'seek-four', title: 'seek-four' },
      { id: 'volume-high', title: 'volume-high' },
      { id: 'volume-low', title: 'volume-low' },
      { id: 'long-play', title: 'long-play' },
      { id: 'pause', title: 'pause' },
      { id: 'resume', title: 'resume' },
      {id:'queue-state',title:'queue-state'},
      {id:'enqueue-end',title:'enqueue-end'},
      {id:'playing',title:'playing'},
      {id:'observations',title:'observations'},
      {
        id: 'sources',
        title: 'sources'
      },
      {
        id: 'play-early',
        title: 'play-early'
      },
      {
        id: 'play-local',
        title: 'play-local'
      },
      {
        id: 'latest',
        title: 'latest'
      },
      {
        id: 'resolve-local',
        title: 'resolve-local'
      },
      {
        id: 'enqueue',
        title: 'enqueue'
      }
    ]
  },
  uses: {
    permissions: [
      {key:'control',name:'player.control',reason:'验证暂停与继续'},
      {key:'read-player',name:'player.read',reason:'核对临时验收队列'},
      {key:'read-route',name:'route.read',reason:'核对页面事件'},
      {
        key: 'catalog',
        name: 'music.read',
        reason: '读取音源'
      },
      {
        key: 'listen',
        name: 'music.control',
        reason: '播放歌曲'
      }
    ]
  },
  ui: {
    menus: [
      { id: 'next', title: 'next', slot: 'playlist.import', commandId: 'next' },
      { id: 'previous', title: 'previous', slot: 'playlist.import', commandId: 'previous' },
      { id: 'mode-sequence', title: 'mode-sequence', slot: 'playlist.import', commandId: 'mode-sequence' },
      { id: 'mode-random', title: 'mode-random', slot: 'playlist.import', commandId: 'mode-random' },
      { id: 'mode-single-muted', title: 'mode-single-muted', slot: 'playlist.import', commandId: 'mode-single-muted' },
      { id: 'unmute', title: 'unmute', slot: 'playlist.import', commandId: 'unmute' },
      { id: 'remove-early', title: 'remove-early', slot: 'playlist.import', commandId: 'remove-early' },
      { id: 'seek-four', title: 'seek-four', slot: 'playlist.import', commandId: 'seek-four' },
      { id: 'volume-high', title: 'volume-high', slot: 'playlist.import', commandId: 'volume-high' },
      { id: 'volume-low', title: 'volume-low', slot: 'playlist.import', commandId: 'volume-low' },
      { id: 'long-play', title: 'long-play', slot: 'playlist.import', commandId: 'long-play' },
      { id: 'pause', title: 'pause', slot: 'playlist.import', commandId: 'pause' },
      { id: 'resume', title: 'resume', slot: 'playlist.import', commandId: 'resume' },
      {id:'queue-state',title:'queue-state',slot:'playlist.import',commandId:'queue-state'},
      {id:'enqueue-end',title:'enqueue-end',slot:'playlist.import',commandId:'enqueue-end'},
      {id:'playing',title:'playing',slot:'playlist.import',commandId:'playing'},
      {id:'observations',title:'observations',slot:'playlist.import',commandId:'observations'},
      {
        id: 'sources',
        slot: 'playlist.import',
        title: 'sources',
        commandId: 'sources'
      },
      {
        id: 'play-early',
        slot: 'playlist.import',
        title: 'play-early',
        commandId: 'play-early'
      },
      {
        id: 'play-local',
        slot: 'playlist.import',
        title: 'play-local',
        commandId: 'play-local'
      },
      {
        id: 'latest',
        slot: 'playlist.import',
        title: 'latest',
        commandId: 'latest'
      },
      {
        id: 'resolve-local',
        slot: 'playlist.import',
        title: 'resolve-local',
        commandId: 'resolve-local'
      },
      {
        id: 'enqueue',
        slot: 'playlist.import',
        title: 'enqueue',
        commandId: 'enqueue'
      }
    ]
  }
}
exports.activate = function (ctx) {
  const observations = []
  for (const event of ['track.started', 'track.finished', 'player.progress', 'route.changed'])
    ctx.events.on(event, value => { observations.push({ event, value }); if (observations.length > 100) observations.shift() })
  ctx.actions.register('observations', () => observations)
  ctx.actions.register('remove-early', async (_, operation) => {
    const queue = await ctx.queue.get({permissionKey:'read-player',operation})
    const song = queue.items.find(item => item.title === '第一首歌')
    return await ctx.queue.remove([song.ref], {permissionKey:'control',operation})
  })
  for (const [id, mode] of [['mode-sequence', {repeat:'all'}], ['mode-random', {shuffle:true}], ['mode-single-muted', {repeat:'one',muted:true}], ['unmute', {muted:false}]]) ctx.actions.register(id, async (_, operation) => {
    await ctx.player.setMode(mode, {permissionKey:'control',operation}); return true
  })
  ctx.actions.register('seek-four', async (_, operation) => {
    await ctx.player.seek(4000, {permissionKey:'control',operation}); return true
  })
  for (const [id, volume] of [['volume-high', 0.8], ['volume-low', 0.15]]) ctx.actions.register(id, async (_, operation) => {
    await ctx.player.setVolume(volume, {permissionKey:'control',operation}); return true
  })
  for (const name of ['next', 'previous']) ctx.actions.register(name, async (_, operation) => {
    await ctx.player[name]({ permissionKey: 'control', operation }); return true
  })
  ctx.actions.register('pause', async (_, operation) => { await ctx.player.pause({ operation, permissionKey: 'control' }); return true })
  ctx.actions.register('resume', async (_, operation) => { await ctx.player.play(undefined, { operation, permissionKey: 'control' }); return true })
  ctx.actions.register('long-play', async (_, operation) => {
    const page = await ctx.music.search('local', { query: '传输控制验收', kinds: ['track'], filters: {}, limit: 5 }, { permissionKey: 'catalog', operation })
    await ctx.music.play(page.items[0].ref, { permissionKey: 'listen', operation }); return true
  })
  let latest = []
  ctx.music.on('sources.changed', (sources) => {
    latest = sources
  })
  ctx.actions.register('sources', () => ctx.music.sources())
  ctx.actions.register('latest', () => latest)
  async function track(source, operation) {
    const page = await ctx.music.search(
      source,
      { query: source === 'local' ? '测试歌曲' : 'one', kinds: ['track'], filters: {}, limit: 5 },
      { permissionKey: 'catalog', operation }
    )
    return page.items[0]
  }
  for (const source of ['early', 'local'])
    ctx.actions.register('play-' + source, async (_input, operation) => {
      const item = await track(source, operation)
      await ctx.music.play(item.ref, { operation, permissionKey: 'listen' })
      return item.title
    })
  ctx.actions.register('resolve-local', async (_input, operation) => {
    const item = await track('local', operation)
    const lyrics = await ctx.music.tracks.lyrics(item.ref, { operation, permissionKey: 'catalog' })
    const result = await ctx.music.tracks.resolve(item.ref, undefined, {
      operation,
      permissionKey: 'listen'
    })
    return { item, lyrics, result }
  })
  ctx.actions.register('queue-state', (_input, operation) => ctx.queue.get({permissionKey:'read-player',operation}))
  ctx.actions.register('playing', (_input, operation) => ctx.player.getState({permissionKey:'read-player',operation}))
  ctx.actions.register('enqueue-end',async (_input,operation)=>{
    const item=await track('early',operation)
    await ctx.music.enqueue([item.ref],'end',{permissionKey:'listen',operation})
    const queue=await ctx.queue.get({permissionKey:'read-player',operation})
    return queue.items.map(song=>song.title)
  })
  ctx.actions.register('enqueue', async (_input, operation) => {
    const item = await track('early', operation)
    await ctx.music.enqueue([item.ref], 'next', { operation, permissionKey: 'listen' })
    return item.title
  })
}
