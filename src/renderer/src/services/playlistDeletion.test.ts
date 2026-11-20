import {expect,jest,test} from '@jest/globals'
import {capturePlaylistDeletion} from './playlistDeletion'

test.each(['local','cloud','both'] as const)('confirmed %s deletion uses only the matching copy',async scope=>{
  const row={id:'local-key',name:'List',meta:{cloudId:'remote-key'}}
  const calls:string[]=[]
  await capturePlaylistDeletion(row,scope).apply(()=>row,async id=>{calls.push('local:'+id)},async id=>{calls.push('cloud:'+id)})
  expect(calls).toEqual(scope==='both'?['cloud:remote-key','local:local-key']:[scope==='local'?'local:local-key':'cloud:remote-key'])
})
test('failed cloud write or changed cloud association cannot delete the local copy',async()=>{
  const row={id:'local-key',name:'List',meta:{cloudId:'remote-key'}}, local=jest.fn(async()=>{})
  const target=capturePlaylistDeletion(row,'both')
  await expect(target.apply(()=>row,local,async()=>{throw Error('offline')})).rejects.toThrow('offline')
  await expect(target.apply(()=>row,local,async()=>{row.meta.cloudId='replacement'})).rejects.toThrow('歌单已更改')
  const cloud=jest.fn(async()=>{})
  await expect(target.apply(()=>row,local,cloud)).rejects.toThrow('歌单已更改')
  expect(local).not.toHaveBeenCalled();expect(cloud).not.toHaveBeenCalled()
})
