import { songKey } from '@common/musicItem'

const mockNetwork = {get:jest.fn(), patch:jest.fn(), delete:jest.fn()}
jest.mock('@renderer/utils/request', () => ({Request:class {get=mockNetwork.get; patch=mockNetwork.patch; delete=mockNetwork.delete},unwrap:(response:unknown)=>response}))
jest.mock('@renderer/utils/file', () => ({}))

const first = {source:'catalog-a', songmid:'same', name:'First', singer:'QA'}
const second = {...first, source:'catalog-b', name:'Second'}
beforeEach(() => { jest.resetModules(); jest.resetAllMocks() })

test('cloud removal matches source and id, skips missing and repeated selections, and respects the server count', async () => {
  mockNetwork.get.mockImplementation(async url => url.endsWith('/capabilities') ? {songIdentity:2} : {list:[first,second]})
  mockNetwork.delete.mockResolvedValue({updatedAt:'now',removed:0})
  const {cloudSongListAPI} = await import('./cloudSongList')
  expect(await cloudSongListAPI.removeSongsFromList('cloud-list',[songKey(second),songKey(second),'missing'])).toEqual({updatedAt:'now',removed:0})
  expect(mockNetwork.delete.mock.calls).toEqual([['/user-songlist/list',{data:{id:'cloud-list',songKeys:[songKey(second)]}}]])
  expect(await cloudSongListAPI.removeSongsFromList('cloud-list',['missing'])).toEqual({updatedAt:'',removed:0})
  expect(mockNetwork.delete).toHaveBeenCalledTimes(1)
})

test('legacy cloud refuses a removal when source-distinct songs share a raw id', async () => {
  mockNetwork.get.mockImplementation(async url => url.endsWith('/capabilities') ? {songIdentity:1} : {list:[first,second]})
  const {cloudSongListAPI} = await import('./cloudSongList')
  await expect(cloudSongListAPI.removeSongsFromList('cloud-list',[songKey(second)])).rejects.toThrow('同 ID')
  expect(mockNetwork.delete).not.toHaveBeenCalled()
})

test.each(['add','remove'])('revocation during cloud %s preparation prevents the network write', async operation => {
  const controller = new AbortController()
  mockNetwork.get.mockImplementation(async url => {
    controller.abort()
    return url.endsWith('/capabilities') ? {songIdentity:2} : {list:[first]}
  })
  const {cloudSongListAPI} = await import('./cloudSongList')
  const pending = operation === 'add' ? cloudSongListAPI.addSongsToList('cloud-list',[first] as any,controller.signal) : cloudSongListAPI.removeSongsFromList('cloud-list',[songKey(first)],controller.signal)
  await expect(pending).rejects.toThrow()
  expect(mockNetwork.patch).not.toHaveBeenCalled();expect(mockNetwork.delete).not.toHaveBeenCalled()
})
