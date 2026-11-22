import { expect, test, jest } from '@jest/globals'
import { desktopBridge } from '@renderer/services/desktopBridge'
import { bindPlaybackOperations, performOperationDefault, runAdjustment, runAdvance, runPlay, runPlaybackFailure, runPlaylistCreate, runQueue, runQueueRemoval, runShuffle, runTransport } from './operations'
test('100 changes without hooks stay local; stale snapshots, private songs and replayed defaults are handled', async () => {
  let update: (snapshot: { revision: number; names: string[] }) => void = () => {},
    initial!: (value: any) => void
  const song = {
    source: 'local',
    name: 'Test',
    singer: 'Demo',
    songmid: 'C:/private/music.wav',
    url: 'file:///private',
    pluginResource: { data: { token: 'private' } }
  } as any
  const play = jest.fn(async (_song: typeof song) => {}),
    queue = jest.fn(async (_songs: (typeof song)[], _position: 'next' | 'end') => {})
  const rpc = jest.fn(async (id: string, name: any, input: any, _from?: string, _system = false): Promise<{prevented:boolean;handledBy:string[]}> => {
    expect(JSON.stringify(input)).not.toMatch(/music[.]wav|file:|token/)
    await performOperationDefault(id, name, input)
    await expect(performOperationDefault(id, name, input)).rejects.toThrow()
    return { prevented: false, handledBy: [] }
  })
  const playlistCreate = jest.fn(async (id:string,input:any) => {
    await performOperationDefault(id,'playlist.create',input)
    return {prevented:false,handledBy:[]}
  })
  const old = Object.getOwnPropertyDescriptor(desktopBridge, 'api')
  Object.defineProperty(desktopBridge, 'api', {
    configurable: true,
    value: {
        plugins: {
          onHookNames: (fn: typeof update) => {
            update = fn
            return () => {}
          },
          hookSnapshot: () =>
            new Promise((resolve) => {
              initial = resolve
            }),
          runPlaybackOperation: rpc,
          playlistCreate
        }
    }
  })
  const disablePreload = jest.fn()
  const stop = bindPlaybackOperations(disablePreload)
  try {
    for (let count = 0; count < 100; count++) await runPlay(song, [song], undefined, play)
    expect(play).toHaveBeenCalledTimes(100)
    expect(rpc).not.toHaveBeenCalled()
    update({ revision: 2, names: ['player.play', 'queue.add'] })
    initial({ revision: 1, names: [] })
    await Promise.resolve()
    await runPlay(song, [song], undefined, play)
    await runQueue([song], 'end', [], undefined, queue)
    const transport = jest.fn(async () => {})
    await runTransport('player.pause', transport)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(2)
    update({ revision: 3, names: ['player.pause', 'player.resume'] })
    await runTransport('player.pause', transport, undefined, true)
    await runTransport('player.resume', transport, 'caller')
    expect(rpc).toHaveBeenNthCalledWith(3, expect.any(String), 'player.pause', {}, undefined, true)
    expect(rpc).toHaveBeenNthCalledWith(4, expect.any(String), 'player.resume', {}, 'caller', false)
    expect(transport).toHaveBeenCalledTimes(3)
    const applied: number[] = []
    await runAdjustment('player.setVolume', {volume:0.5}, value => applied.push(value.volume))
    expect(applied).toEqual([0.5])
    const select = jest.fn(async (_selected?: typeof song) => {})
    await runAdvance('ended', [song], select, undefined, true)
    expect(rpc).toHaveBeenCalledTimes(4)
    update({ revision: 4, names: ['player.next'] })
    update({ revision: 5, names: ['player.next'] })
    expect(disablePreload).toHaveBeenCalledTimes(1)
    const queued = { ...song, source: 'demo', songmid: 'one', pluginResource: undefined }
    const track = { ref: {kind:'track',providerId:'demo',id:'one'}, title:'Test', metadata:{artists:[]} }
    rpc.mockImplementationOnce(async (id, name, input) => {
      await performOperationDefault(id,name,{...input,track})
      return {prevented:false,handledBy:[]}
    })
    await runAdvance('error',[queued],select,undefined,true)
    expect(select).toHaveBeenLastCalledWith(queued)
    rpc.mockImplementationOnce(async (id, name, input) => {
      await performOperationDefault(id,name,{...input,track:{...track,ref:{...track.ref,id:'missing'}}})
      return {prevented:false,handledBy:[]}
    })
    await runAdvance('user',[queued],select,'caller')
    expect(select).toHaveBeenLastCalledWith(undefined)
    update({ revision: 6, names: ['player.setVolume'] })
    let release!: () => void
    const delayed = new Promise<void>(resolve => { release = resolve })
    rpc.mockImplementationOnce(async (id, name) => {
      await delayed
      await performOperationDefault(id, name, { volume: 0.1 })
      return {prevented:false,handledBy:[]}
    })
    const first = runAdjustment('player.setVolume', {volume:0.2}, value => applied.push(value.volume), 'caller')
    await runAdjustment('player.setVolume', {volume:0.7}, value => applied.push(value.volume), 'caller')
    release()
    await first
    expect(applied).toEqual([0.5,0.7])
    update({ revision: 7, names: ['queue.clear','queue.remove'] })
    const queueAtClick = [song, queued], remove = jest.fn(async (_items: typeof queueAtClick) => {})
    rpc.mockImplementationOnce(async (id, name, input) => {
      expect(input).toEqual({})
      queueAtClick.push({...queued, songmid:'later'})
      await performOperationDefault(id,name,input)
      return {prevented:false,handledBy:[]}
    })
    await runQueueRemoval('queue.clear', [], queueAtClick, 'caller', remove)
    expect(remove).toHaveBeenLastCalledWith([song,queued])
    rpc.mockImplementationOnce(async (id, name) => {
      await performOperationDefault(id,name,{tracks:[{...track,ref:{...track.ref,id:'missing'}}]})
      return {prevented:false,handledBy:[]}
    })
    await runQueueRemoval('queue.remove',[song],queueAtClick,'caller',remove)
    expect(remove).toHaveBeenCalledTimes(1)
    await runQueueRemoval('queue.remove',[song],queueAtClick,'caller',remove)
    expect(remove).toHaveBeenLastCalledWith([song])
    expect(play).toHaveBeenLastCalledWith(song)
    expect(queue).toHaveBeenCalledWith([song], 'end')
    const skipFailed = jest.fn(async () => {})
    const requests = rpc.mock.calls.length
    await runPlaybackFailure(song,'resolve',skipFailed)
    expect(rpc).toHaveBeenCalledTimes(requests)
    update({revision:8,names:['player.error']})
    rpc.mockImplementationOnce(async (_id,name,input,from,system) => {
      expect([name,from,system]).toEqual(['player.error',undefined,true])
      expect(input.track.ref.providerId).toBe('private')
      expect(input.error).toBe('media')
      expect(JSON.stringify(input)).not.toMatch(/music[.]wav|file:|token/)
      return {prevented:true,handledBy:['guard']}
    })
    await runPlaybackFailure(song,'media',skipFailed)
    expect(skipFailed).toHaveBeenCalledTimes(1)
    await runPlaybackFailure(song,'start',skipFailed)
    expect(skipFailed).toHaveBeenCalledTimes(2)
    const duplicate = {...queued, url:'another private URL'}, candidates = [queued, song, duplicate]
    const applyShuffle = jest.fn((_songs: typeof candidates) => {})
    const beforeShuffle = rpc.mock.calls.length
    expect(runShuffle(candidates,applyShuffle)).toBeUndefined()
    update({revision:9,names:['queue.shuffle']})
    expect(runShuffle([song],applyShuffle)).toBeUndefined()
    expect(runShuffle(Array(1001).fill(song),applyShuffle)).toBeUndefined()
    expect(rpc).toHaveBeenCalledTimes(beforeShuffle)
    rpc.mockImplementationOnce(async (id,name,input,from,system) => {
      expect([name,from,system]).toEqual(['queue.shuffle',undefined,true])
      expect(JSON.stringify(input)).not.toMatch(/music[.]wav|file:|token|private URL/)
      expect(input.items[1].ref.providerId).toBe('private')
      await performOperationDefault(id,name,{items:[input.items[1],input.items[2],input.items[0]]})
      return {prevented:false,handledBy:[]}
    })
    await runShuffle(candidates,applyShuffle)
    expect(applyShuffle.mock.calls[0][0]).toEqual([song,queued,duplicate])
    expect(candidates).toEqual([queued,song,duplicate])
    const create = jest.fn(async (_name:string)=>undefined)
    const callsBeforeCreate=rpc.mock.calls.length
    await runPlaylistCreate('Original',create)
    expect(create).toHaveBeenLastCalledWith('Original')
    expect(rpc).toHaveBeenCalledTimes(callsBeforeCreate)
    update({revision:10,names:['playlist.create']})
    await runPlaylistCreate('Original',create)
    expect(create).toHaveBeenCalledTimes(2)
    expect(playlistCreate).toHaveBeenLastCalledWith(expect.any(String), {name:'Original',location:'local'})
    playlistCreate.mockImplementationOnce(async () => ({prevented:true,handledBy:[]}))
    await runPlaylistCreate('Cancelled',create)
    expect(create).toHaveBeenCalledTimes(2)
  } finally {
    stop()
    if (old) Object.defineProperty(desktopBridge, 'api', old)
    else Reflect.deleteProperty(desktopBridge, 'api')
  }
})
