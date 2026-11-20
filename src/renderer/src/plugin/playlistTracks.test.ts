import { desktopBridge } from '@renderer/services/desktopBridge'
import { bindPlaybackOperations, performOperationDefault, runPlaylistTracks, runPlaylistExport, runPlaylistImport } from './operations'

jest.mock('@renderer/services/desktopBridge', () => ({desktopBridge:{api:{plugins:{onHookNames:jest.fn(() => jest.fn()),hookSnapshot:jest.fn(),playlistTracks:jest.fn(),playlistExport:jest.fn(),playlistImport:jest.fn()}}}}))

const plugins = jest.mocked(desktopBridge.api.plugins)
const playlist = {id:'list-1', name:'Original', location:'local'} as const
const songs = [{source:'catalog', songmid:'one', name:'First'}, {source:'local',songmid:'C:/private/song.wav',name:'Second'}] as any[]

test('import cancels before invoking the importer and executes a rewrite exactly once',async()=>{
  plugins.hookSnapshot.mockResolvedValue({revision:1,names:[],announce:false} as any)
  unbind=bindPlaybackOperations()
  await Promise.resolve()
  const write=jest.fn(async (_input:unknown)=>{}), input={value:'original',importerId:'test.source:lists'}
  await runPlaylistImport(input,write)
  expect(write).toHaveBeenCalledWith(input)
  expect(plugins.playlistImport).not.toHaveBeenCalled()
  write.mockClear()
  plugins.onHookNames.mock.calls[0][0]({revision:2,names:['playlist.import'],announce:false} as any)
  plugins.playlistImport.mockResolvedValueOnce({prevented:true,handledBy:[]})
  await runPlaylistImport(input,write)
  expect(write).not.toHaveBeenCalled()
  const rewritten={value:'changed',importerId:'test.other:lists'}
  plugins.playlistImport.mockImplementationOnce(async id=>{
    await performOperationDefault(id,'playlist.import',rewritten)
    await expect(performOperationDefault(id,'playlist.import',input)).rejects.toThrow()
    return {prevented:false,handledBy:[]}
  })
  await runPlaylistImport(input,write)
  expect(write.mock.calls).toEqual([[rewritten]])
})
test('export skips the bridge without subscribers, cancels without saving and allows one format switch', async () => {
  plugins.hookSnapshot.mockResolvedValue({revision:1,names:[],announce:false} as any)
  unbind=bindPlaybackOperations()
  await Promise.resolve()
  const save=jest.fn(async (_format:string)=>{})
  await runPlaylistExport(playlist,save)
  expect(save).toHaveBeenCalledWith('cmpl')
  expect(plugins.playlistExport).not.toHaveBeenCalled()
  save.mockClear()
  plugins.onHookNames.mock.calls[0][0]({revision:2,names:['playlist.export'],announce:false} as any)
  plugins.playlistExport.mockResolvedValueOnce({prevented:true,handledBy:[]})
  await runPlaylistExport(playlist,save)
  expect(save).not.toHaveBeenCalled()
  plugins.playlistExport.mockImplementationOnce(async (id,input)=>{
    expect(input).toEqual({playlist,format:'cmpl'})
    await performOperationDefault(id,'playlist.export',{...input,format:'cpl'})
    await expect(performOperationDefault(id,'playlist.export',input)).rejects.toThrow()
    return {prevented:false,handledBy:[]}
  })
  await runPlaylistExport(playlist,save)
  expect(save.mock.calls).toEqual([['cpl']])
})
let unbind:()=>void
afterEach(() => { unbind?.(); jest.clearAllMocks() })

test.each(['playlist.addTracks','playlist.removeTracks'] as const)('%s uses a local fast path and resolves only the current selection', async name => {
  plugins.hookSnapshot.mockResolvedValue({revision:1,names:[],announce:false} as any)
  unbind = bindPlaybackOperations()
  await Promise.resolve()
  const write = jest.fn(async () => {})
  await runPlaylistTracks(name, playlist, songs, write)
  expect(write).toHaveBeenCalledWith(songs)
  expect(plugins.playlistTracks).not.toHaveBeenCalled()
  write.mockClear()
  plugins.onHookNames.mock.calls[0][0]({revision:2,names:[name],announce:false} as any)
  plugins.playlistTracks.mockImplementationOnce(async (id, operation, input) => {
    expect(JSON.stringify(input)).not.toContain('C:/private')
    expect(input.tracks[1].ref.providerId).toBe('private')
    const filtered = {...input, tracks:[input.tracks[1]]}
    await performOperationDefault(id, operation, filtered)
    await expect(performOperationDefault(id, operation, filtered)).rejects.toThrow()
    return {prevented:false,handledBy:[]}
  })
  await runPlaylistTracks(name, playlist, songs, write)
  expect(write.mock.calls).toEqual([[[songs[1]]]])
  write.mockClear()
  plugins.playlistTracks.mockResolvedValueOnce({prevented:true,handledBy:[]})
  await runPlaylistTracks(name, playlist, songs, write)
  expect(write).not.toHaveBeenCalled()
})
