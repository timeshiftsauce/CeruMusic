import { desktopBridge } from '@renderer/services/desktopBridge'
import type {
  OperationInputs,
  LibraryOperationName,
  OperationTrack,
  PlaybackOperationName
} from '@shiqianjiang/ceru-plugin-sdk'
import type { SongList } from '@renderer/types/audio'

type Position = 'next' | 'end'
type UiOperationName = PlaybackOperationName | LibraryOperationName | 'window.close'
const pending = new Map<
  string,
  { name: UiOperationName; run: (value: any) => Promise<void> }
>()
let names = new Set<string>(),
  revision = -1,
  announce = true
export const interceptsAdvance = () => names.has('player.next')
export const interceptsShuffle = () => names.has('queue.shuffle')
export const interceptsQueueEnd = () => names.has('player.queueEnded')
export const interceptsRoute = () => names.has('router.navigate')
export const hasOperation = (name: string) => names.has(name)
export const interceptsSuggestions = () => names.has('search.suggest')
export const interceptsSearchResults = () => names.has('search.results')
export const resolveSearchQuery = (query:string,sourceId:string) => names.has('search.query')
  ? desktopBridge.api.plugins.searchQuery({query,sourceId,kinds:['track','playlist']})
  : Promise.resolve(query)
export function bindPlaybackOperations(onAdvanceEnabled?: () => void) {
  let bound = true
  const update = (snapshot: import('@common/pluginHookControls').HookSnapshot) => {
    if (bound && snapshot.revision >= revision) {
      revision = snapshot.revision
      const previousNames = names
      names = new Set(snapshot.names)
      if (['player.next','queue.shuffle','player.queueEnded'].some(name=>!previousNames.has(name) && names.has(name))) onAdvanceEnabled?.()
      announce = snapshot.announce !== false
    }
  }
  const off = desktopBridge.api.plugins.onHookNames(update)
  void desktopBridge.api.plugins.hookSnapshot().then(update).catch(console.warn)
  return () => {
    bound = false
    off()
    names.clear()
    revision = -1
    pending.clear()
  }
}
export async function performOperationDefault(
  id: string,
  name: UiOperationName,
  input: unknown
) {
  const entry = pending.get(id)
  if (!entry || entry.name !== name) throw Error('播放操作已结束')
  pending.delete(id)
  await entry.run(input)
  return null
}
export function projectOperationTrack(song: SongList): OperationTrack {
    const ref = song.pluginResource,
      provider = String(ref?.providerId ?? song.source ?? '')
    const raw = String(ref?.id ?? song.songmid ?? '')
    const portable =
      provider !== 'local' &&
      (!ref || (ref.scope === 'provider' && !ref.connectionId)) &&
      /^[a-z0-9._-]{1,128}$/i.test(provider) &&
      /^[a-z0-9._-]{1,256}$/i.test(raw)
    const providerId = portable ? provider : 'private',
      id = portable ? raw : crypto.randomUUID()
    return {
      ref: { kind: 'track', id, providerId },
      title: String(song.name ?? '').slice(0, 512),
      metadata: {
        artists: String(song.singer ?? '')
          .split('、')
          .filter(Boolean)
          .slice(0, 32)
          .map((artist) => artist.slice(0, 256))
      }
    }
}
function selection(songs: SongList[], queue: SongList[]) {
  const entries = new Map<string, SongList>()
  const tracks = songs.map(song => {
    const track = projectOperationTrack(song)
    entries.set(JSON.stringify([track.ref.providerId, track.ref.id]), song)
    return track
  })
  const resolve = (target: OperationTrack) =>
    entries.get(JSON.stringify([target.ref.providerId, target.ref.id])) ??
    queue.find((song) => {
      const ref = song.pluginResource
      return (
        target.ref.providerId !== 'private' &&
        target.ref.providerId !== 'local' &&
        (!ref || ref.scope === 'provider') &&
        (ref?.providerId ?? song.source) === target.ref.providerId &&
        String(ref?.id ?? song.songmid) === target.ref.id
      )
    })
  return { tracks, resolve }
}
export async function announcePluginOperation(handledBy: string[], undo?: () => Promise<unknown>) {
  if (!announce || !handledBy.length) return
  const [{ MessagePlugin }, { h }] = await Promise.all([import('tdesign-vue-next'), import('vue')])
  const message = '已由 ' + handledBy.join('、') + ' 处理'
  if (!undo) { void MessagePlugin.info(message); return }
  let used = false
  void MessagePlugin.info({
    duration: 6000,
    content: () => h('span', [message, ' ', h('button', {
      type: 'button',
      onClick(event: MouseEvent) {
        if (used) return
        used = true
        ;(event.currentTarget as HTMLButtonElement).disabled = true
        void undo().catch(reason => MessagePlugin.error(String(reason)))
      }
    }, '撤销本次')])
  })
}
async function dispatch<Name extends PlaybackOperationName>(
  name: Name,
  input: OperationInputs[Name],
  from: string | undefined,
  run: (value: OperationInputs[Name]) => Promise<void>,
  system = false
) {
  const id = crypto.randomUUID()
  pending.set(id, { name, run })
  try {
    const outcome = await desktopBridge.api.plugins.runPlaybackOperation(id, name, input, from, system)
    if (!from && !system) {
      const replay = outcome.prevented || name === 'player.seek' || name === 'player.setVolume' || name === 'player.setMode'
      await announcePluginOperation(outcome.handledBy, replay ? () => run(input) : undefined)
    }
  } finally {
    pending.delete(id)
  }
}
type Adjustment = 'player.seek' | 'player.setVolume' | 'player.setMode'
export async function runTrackLike(song:SongList,liked:boolean,location:'player'|'shortcut'|'song-list',candidates:SongList[],apply:(target:SongList,desired:boolean)=>Promise<boolean>) {
  if (!names.has('track.like')) {await apply(song,liked);return}
  const id=crypto.randomUUID(), {tracks,resolve}=selection([song],candidates)
  const input={track:tracks[0],liked}
  let restore:(()=>Promise<boolean>)|undefined
  pending.set(id,{name:'track.like',run:async (value:OperationInputs['track.like'])=>{
    let target=resolve(value.track)
    if (!target && !['private','local'].includes(value.track.ref.providerId)) {
      const {toAppTrack}=await import('@common/pluginMusic')
      target=toAppTrack({...value.track,ref:{...value.track.ref,scope:'provider'}})
    }
    if (!target) throw Error('无法解析收藏歌曲')
    const selected=target,previous=await apply(selected,value.liked)
    if (selected!==song && previous!==value.liked) restore=()=>apply(selected,previous)
  }})
  try {
    const outcome=await desktopBridge.api.plugins.trackLike(id,input,location)
    if (outcome.handledBy.length) {
      const {activePluginContributions}=await import('@renderer/services/pluginState')
      const labels=outcome.handledBy.map(owner=>activePluginContributions.value.find(row=>row.descriptor.id===owner)?.descriptor.name ?? owner)
      await announcePluginOperation(labels,async()=>{await restore?.();await apply(song,liked)})
    }
  } finally {pending.delete(id)}
}
const adjustmentSequence: Record<Adjustment, number> = { 'player.seek': 0, 'player.setVolume': 0, 'player.setMode': 0 }
export async function runPlaylistCreate(name:string, create:(name:string)=>Promise<undefined | (()=>Promise<void>)>) {
  if (!names.has('playlist.create')) { await create(name); return }
  const input:OperationInputs['playlist.create']={name,location:'local'}, id=crypto.randomUUID()
  let undo:(()=>Promise<void>)|undefined
  pending.set(id,{name:'playlist.create',run:async (value:OperationInputs['playlist.create'])=>{undo=await create(value.name)}})
  try {
    const outcome=await desktopBridge.api.plugins.playlistCreate(id,input)
    if (!outcome.handledBy.length) return
    const {activePluginContributions}=await import('@renderer/services/pluginState')
    const labels=outcome.handledBy.map(owner=>activePluginContributions.value.find(row=>row.descriptor.id===owner)?.descriptor.name ?? owner)
    await announcePluginOperation(labels,outcome.prevented ? async()=>{await create(name)} : undo)
  } finally {pending.delete(id)}
}
export async function runPlaylistImport(input:OperationInputs['playlist.import'], importPlaylist:(value:OperationInputs['playlist.import'])=>Promise<void>) {
  const original = {...input}
  if (!names.has('playlist.import')) return importPlaylist(original)
  const id = crypto.randomUUID()
  pending.set(id,{name:'playlist.import',run:importPlaylist})
  try {
    const outcome = await desktopBridge.api.plugins.playlistImport(id,original)
    if (!outcome.handledBy.length) return
    const {activePluginContributions} = await import('@renderer/services/pluginState')
    const labels = outcome.handledBy.map(owner=>activePluginContributions.value.find(row=>row.descriptor.id===owner)?.descriptor.name ?? owner)
    await announcePluginOperation(labels,outcome.prevented ? ()=>importPlaylist(original) : undefined)
  } finally {pending.delete(id)}
}
let closing: Promise<void> | undefined
export function runWindowClose(close:()=>void, location:'titlebar'|'shortcut') {
  if (closing) return closing
  if (!names.has('window.close')) {close();return Promise.resolve()}
  const id=crypto.randomUUID()
  pending.set(id,{name:'window.close',run:async()=>{close()}})
  closing=Promise.resolve().then(async()=>{
    try {
      const outcome=await desktopBridge.api.plugins.windowClose(id,location)
      if (outcome.prevented && outcome.handledBy.length) {
        const {activePluginContributions}=await import('@renderer/services/pluginState')
        const labels=outcome.handledBy.map(owner=>activePluginContributions.value.find(row=>row.descriptor.id===owner)?.descriptor.name ?? owner)
        await announcePluginOperation(labels,async()=>{close()})
      }
    } finally {pending.delete(id);closing=undefined}
  })
  return closing
}
export async function runPlaylistExport(playlist:{id:string;name:string}, save:(format:OperationInputs['playlist.export']['format'])=>Promise<void>) {
  if (!names.has('playlist.export')) return save('cmpl')
  const id=crypto.randomUUID(), input:OperationInputs['playlist.export']={playlist:{id:playlist.id,name:playlist.name.slice(0,512),location:'local'},format:'cmpl'}
  pending.set(id,{name:'playlist.export',run:async (value:OperationInputs['playlist.export'])=>{
    if (value.playlist.id !== input.playlist.id || value.playlist.location !== input.playlist.location || (value.format !== 'cmpl' && value.format !== 'cpl')) throw Error('导出目标或格式无效')
    await save(value.format)
  }})
  try {
    const outcome=await desktopBridge.api.plugins.playlistExport(id,input)
    if (!outcome.handledBy.length) return
    const {activePluginContributions}=await import('@renderer/services/pluginState')
    const labels=outcome.handledBy.map(owner=>activePluginContributions.value.find(row=>row.descriptor.id===owner)?.descriptor.name ?? owner)
    await announcePluginOperation(labels,outcome.prevented ? ()=>save('cmpl') : undefined)
  } finally { pending.delete(id) }
}
export async function runPlaylistDelete(playlist:{id:string;name:string},location:'local'|'cloud'|'both',remove:()=>Promise<void>,reconfirm:()=>Promise<void>) {
  if (!names.has('playlist.delete')) {await remove();return}
  const id=crypto.randomUUID(), input:OperationInputs['playlist.delete']={playlist:{id:playlist.id,name:playlist.name.slice(0,512),location}}
  pending.set(id,{name:'playlist.delete',run:async value=>{
    if(value.playlist.id!==playlist.id || value.playlist.location!==location) throw Error('歌单删除目标不匹配')
    await remove()
  }})
  try {
    const outcome=await desktopBridge.api.plugins.playlistDelete(id,input)
    if(outcome.handledBy.length) {
      const {activePluginContributions}=await import('@renderer/services/pluginState')
      const labels=outcome.handledBy.map(owner=>activePluginContributions.value.find(row=>row.descriptor.id===owner)?.descriptor.name ?? owner)
      await announcePluginOperation(labels,outcome.prevented ? reconfirm : undefined)
    }
  } finally {pending.delete(id)}
}
export async function runPlaylistTracks(name:'playlist.addTracks'|'playlist.removeTracks', playlist:OperationInputs['playlist.delete']['playlist'], songs:SongList[], write:(selected:SongList[])=>Promise<void>) {
  if (!songs.length) return
  if (!names.has(name)) { await write(songs); return }
  const {tracks, resolve} = selection(songs, [])
  const input = {playlist:{...playlist, name:playlist.name.slice(0,512)}, tracks}
  const id = crypto.randomUUID()
  pending.set(id, {name, run:async (value:OperationInputs['playlist.addTracks']) => {
    if (value.playlist.id !== input.playlist.id || value.playlist.location !== input.playlist.location || value.playlist.name !== input.playlist.name) throw Error('歌单目标不匹配')
    const selected = value.tracks.map(item => {
      const song = resolve(item)
      if (!song) throw Error('歌曲不在本次选择中')
      return song
    })
    if (selected.length) await write(selected)
  }})
  try {
    const outcome = await desktopBridge.api.plugins.playlistTracks(id, name, input)
    if (outcome.handledBy.length) {
      const {activePluginContributions} = await import('@renderer/services/pluginState')
      const labels = outcome.handledBy.map(owner => activePluginContributions.value.find(row => row.descriptor.id === owner)?.descriptor.name ?? owner)
      await announcePluginOperation(labels, outcome.prevented ? () => write(songs) : undefined)
    }
  } finally { pending.delete(id) }
}
export function runAdjustment<Name extends Adjustment>(name: Name, input: OperationInputs[Name], apply: (value: OperationInputs[Name]) => void, from?: string, system = false) {
  const sequence = ++adjustmentSequence[name]
  if (!names.has(name)) {
    apply(input)
    return Promise.resolve()
  }
  return dispatch(name, input, from, async value => {
    if (sequence === adjustmentSequence[name]) apply(value)
  }, system)
}
export function runTransport(name: 'player.pause' | 'player.resume' | 'player.previous', local: () => Promise<void>, from?: string, system = false) {
  if (!names.has(name)) return local()
  return dispatch(name, {}, from, local, system)
}
export function runAdvance(reason: OperationInputs['player.next']['reason'], queue: SongList[], local: (selected?: SongList) => Promise<void>, from?: string, system = false) {
  if (!names.has('player.next')) return local()
  const { resolve } = selection([], queue)
  return dispatch('player.next', { reason }, from, value => local(value.track ? resolve(value.track) : undefined), system)
}
export function runPlaybackFailure(song: SongList, error: OperationInputs['player.error']['error'], local: () => Promise<void>) {
  if (!names.has('player.error')) return local()
  return dispatch('player.error', { track: projectOperationTrack(song), error }, undefined, local, true)
}
export function runShuffle(songs: SongList[], apply: (ordered: SongList[]) => void) {
  if (!interceptsShuffle() || songs.length < 2 || songs.length > 1000) return
  const items = songs.map(projectOperationTrack), buckets = new Map<string,SongList[]>()
  items.forEach((item,index) => {
    const key = JSON.stringify(item), bucket = buckets.get(key)
    if (bucket) bucket.push(songs[index]); else buckets.set(key,[songs[index]])
  })
  return dispatch('queue.shuffle',{items},undefined,async value => {
    if (value.items.length !== songs.length) throw Error('随机排序遗漏队列歌曲')
    const ordered = value.items.map(item => {
      const song = buckets.get(JSON.stringify(item))?.shift()
      if (!song) throw Error('随机排序包含未知歌曲')
      return song
    })
    apply(ordered)
  },true)
}
export function runQueueEnd(queue: SongList[], apply: (continuation?: SongList[]) => Promise<void>) {
  if (!interceptsQueueEnd()) return apply()
  return dispatch('player.queueEnded',{},undefined,async ({tracks})=>{
    if (!tracks) return apply()
    const { toAppTrack } = await import('@common/pluginMusic')
    const { resolve } = selection([],queue)
    await apply(tracks.map(track=>resolve(track) ?? toAppTrack({...track,ref:{...track.ref,scope:'provider'}})))
  },true)
}
export function runPlay(
  song: SongList,
  queue: SongList[],
  from: string | undefined,
  local: (song: SongList) => Promise<void>
) {
  if (!names.has('player.play')) return local(song)
  const { tracks, resolve } = selection([song], queue),
    index = queue.indexOf(song)
  return dispatch(
    'player.play',
    { track: tracks[0], ...(index >= 0 ? { queueIndex: index } : {}) },
    from,
    async (value) => {
      const selected =
        value.queueIndex !== undefined && value.queueIndex !== index
          ? queue[value.queueIndex]
          : resolve(value.track)
      await local(selected ?? song)
    }
  )
}
export function runQueueRemoval(name: 'queue.remove' | 'queue.clear', requested: SongList[], queue: SongList[], from: string | undefined, local: (songs: SongList[]) => Promise<void>) {
  const original = name === 'queue.clear' ? [...queue] : [...requested]
  if (!original.length || !names.has(name)) return local(original)
  const snapshot = [...queue]
  const { tracks, resolve } = selection(name === 'queue.remove' ? original : [], snapshot)
  return dispatch(name, name === 'queue.clear' ? {} : {tracks}, from, async value => {
    if (value.tracks === undefined) return local(original)
    const selected = value.tracks.map(resolve)
    if (selected.every((song): song is SongList => !!song)) await local([...new Set(selected)])
  })
}
export function runQueue(
  songs: SongList[],
  position: Position,
  queue: SongList[],
  from: string | undefined,
  local: (songs: SongList[], position: Position) => Promise<void>
) {
  if (!names.has('queue.add') || !songs.length) return local(songs, position)
  const { tracks, resolve } = selection(songs, queue)
  return dispatch('queue.add', { tracks, position }, from, async (value) => {
    const selected = value.tracks.map(resolve)
    if (selected.every((song): song is SongList => !!song)) await local(selected, value.position)
    else await local(songs, position)
  })
}
