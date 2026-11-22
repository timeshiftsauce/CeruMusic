jest.mock('@renderer/services/desktopBridge', () => ({
  desktopBridge: { api: { plugins: { importerTracks: jest.fn() } } }
}))
jest.mock('@renderer/api/songList', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    getById: jest.fn(),
    delete: jest.fn(),
    addSongs: jest.fn(),
    removeSongs: jest.fn(),
    getSongs: jest.fn(),
    updateCover: jest.fn()
  }
}))
jest.mock('@renderer/api/cloudSongList', () => ({
  cloudSongListAPI: {
    createUserSongList: jest.fn(),
    getUserSongLists: jest.fn(),
    getSongListDetail: jest.fn(),
    deleteUserSongList: jest.fn(),
    addSongsToList: jest.fn(),
    removeSongsFromList: jest.fn()
  }
}))
jest.mock('@renderer/store/Auth', () => ({ useAuthStore: () => ({ isAuthenticated: true }) }))
jest.mock('@renderer/services/pluginState', () => ({
  playlistImporters: {
    value: [{ publicId: 'demo:list', pluginId: 'owner', id: 'list', title: 'Demo' }]
  },
  libraryRevision: { value: 0 }
}))
jest.mock('@common/pluginMusic', () => ({
  toAppTrack: (item: any) => ({
    songmid: item.ref.id,
    source: item.ref.providerId,
    name: item.title
  })
}))
jest.mock('@renderer/utils/playlist/cloudList', () => ({
  mapSongsToCloud: (items: unknown) => items
}))
jest.mock('@renderer/utils/playlist/playlistExportImport', () => ({
  exportPlaylistToFile: jest.fn()
}))
import { performPlaylistTool } from './playlistTools'
import local from '@renderer/api/songList'
import { cloudSongListAPI as cloud } from '@renderer/api/cloudSongList'
import { desktopBridge } from '@renderer/services/desktopBridge'
import { exportPlaylistToFile } from '@renderer/utils/playlist/playlistExportImport'

const mock = (fn: unknown) => fn as jest.Mock
const playlist = { id: 'p', name: 'Example', location: 'local' as const }
const tracks = [
  {
    ref: { kind: 'track' as const, providerId: 'demo', id: 'song' },
    title: 'Song',
    metadata: { artists: [] }
  }
]
beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(globalThis, { window: { dispatchEvent: jest.fn() } })
  mock(local.getById).mockResolvedValue({
    success: true,
    data: { id: 'p', name: 'Example', meta: { cloudId: 'remote' } }
  })
  for (const fn of [
    local.create,
    local.delete,
    local.addSongs,
    local.removeSongs,
    local.updateCover
  ])
    mock(fn).mockResolvedValue({ success: true, data: { id: 'new' } })
  mock(cloud.getUserSongLists).mockResolvedValue([{ id: 'remote', name: 'Example' }])
})
const run = (name: Parameters<typeof performPlaylistTool>[0], input: any, signal?: AbortSignal) =>
  performPlaylistTool(name, input, signal, async () => 'demo:list')
test('all six tools reach real renderer operations without another hook dispatch', async () => {
  await run('playlist.create', { name: 'New', location: 'local' })
  await run('playlist.addTracks', { playlist, tracks })
  await run('playlist.removeTracks', { playlist, tracks })
  mock(local.getSongs).mockResolvedValue({
    success: true,
    data: [{ songmid: 'song', source: 'demo' }]
  })
  await run('playlist.export', { playlist, format: 'cpl' })
  await run('playlist.delete', { playlist })
  mock(desktopBridge.api.plugins.importerTracks).mockResolvedValue({
    name: 'Imported',
    items: tracks
  })
  await run('playlist.import', { value: 'input' })
  expect(local.create).toHaveBeenCalledWith('New', '', 'local')
  expect(local.addSongs).toHaveBeenCalledWith('p', [
    { songmid: 'song', source: 'demo', name: 'Song' }
  ])
  expect(local.removeSongs).toHaveBeenCalledTimes(1)
  expect(exportPlaylistToFile).toHaveBeenCalledWith(
    [{ songmid: 'song', source: 'demo' }],
    'CeruMusic-Example.cpl',
    'cpl'
  )
  expect(local.delete).toHaveBeenCalledWith('p')
  expect(local.addSongs).toHaveBeenCalledWith('new', [
    { songmid: 'song', source: 'demo', name: 'Song' }
  ])
})
test('stale playlist identity prevents deletion', async () => {
  await expect(run('playlist.delete', { playlist: { ...playlist, name: 'Old' } })).rejects.toThrow(
    '歌单已更改'
  )
  expect(local.delete).not.toHaveBeenCalled()
})
test('revocation during cloud lookup prevents any mutation', async () => {
  const controller = new AbortController()
  mock(cloud.getUserSongLists).mockImplementation(async () => {
    controller.abort()
    return [{ id: 'remote', name: 'Example' }]
  })
  await expect(
    run('playlist.delete', { playlist: { ...playlist, location: 'both' } }, controller.signal)
  ).rejects.toThrow()
  expect(local.delete).not.toHaveBeenCalled()
  expect(cloud.deleteUserSongList).not.toHaveBeenCalled()
})
test('both-copy deletion resolves cloud mapping and cancels before local delete', async () => {
  const controller = new AbortController()
  mock(cloud.deleteUserSongList).mockImplementation(async () => {
    controller.abort()
  })
  await expect(
    run('playlist.delete', { playlist: { ...playlist, location: 'both' } }, controller.signal)
  ).rejects.toThrow()
  expect(cloud.deleteUserSongList).toHaveBeenCalledWith('remote', controller.signal)
  expect(local.delete).not.toHaveBeenCalled()
})
test('repeating importer cursor fails before creating a playlist', async () => {
  mock(desktopBridge.api.plugins.importerTracks).mockResolvedValue({
    items: tracks,
    nextCursor: 'same'
  })
  await expect(run('playlist.import', { value: 'input', importerId: 'demo:list' })).rejects.toThrow(
    '重复'
  )
  expect(local.create).not.toHaveBeenCalled()
})
test('cancelled importer result does not persist; failed write rolls back only created playlist', async () => {
  const controller = new AbortController()
  mock(desktopBridge.api.plugins.importerTracks).mockImplementation(async () => {
    controller.abort()
    return { items: tracks }
  })
  await expect(run('playlist.import', { value: 'input' }, controller.signal)).rejects.toThrow()
  expect(local.create).not.toHaveBeenCalled()
  mock(desktopBridge.api.plugins.importerTracks).mockResolvedValue({ items: tracks })
  mock(local.addSongs).mockResolvedValue({ success: false, error: 'write failed' })
  await expect(run('playlist.import', { value: 'input' })).rejects.toThrow('write failed')
  expect(local.delete).toHaveBeenCalledWith('new')
})
