import mitt from 'mitt'
import { MessagePlugin } from 'tdesign-vue-next'
import type { SongList } from '@renderer/types/audio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import { calculateBestQuality } from '@common/utils/quality'

/**
 * 一起听场景下的"member 点歌"分流 —— addToPlaylistAndPlay/End/replacePlaylist
 * 这些操作对 member 来说都不应直接修改本地播放列表(否则与房间同步状态脱节),
 * 而是提交 lt.requestSong 进入 pending 等管理员审批。
 *
 * 返回 true 表示已提交点歌请求并提示用户,调用方应早 return 不继续后续逻辑。
 *
 * 用动态 import 避免与 ListenTogether store 形成循环依赖。
 */
async function tryRequestSongAsMember(song: SongList): Promise<boolean> {
  try {
    const { useListenTogetherStore } = await import('@renderer/store')
    const lt = useListenTogetherStore()
    if (!lt.isInRoom || lt.canControl) return false

    /* 本地预检 —— 服务端虽然也会拦截,但乐观 success 会先弹一条紧接着错误警告
     * 两条消息互相打架,UX 很怪。在 emit 之前先按本地 state 拦一下,常见场景
     * (双击点歌按钮 / 同曲重复点)能立刻提示而不用等服务端往返。 */
    const songmid = String(song.songmid)
    const source = song.source
    const queueDup = lt.queue.some((q) => q.song?.songmid === songmid && q.song?.source === source)
    if (queueDup) {
      await MessagePlugin.warning(`《${song.name || '?'}》已在播放队列里了`)
      return true /* 已"处理" → 阻止调用方继续走默认播放路径 */
    }
    const myUserId = lt.myUserId
    const pendingDup = lt.pending.some((p) => {
      if (p.song?.songmid !== songmid || p.song?.source !== source) return false
      const reqs = Array.isArray(p.requesters) ? p.requesters : [{ userId: p.requesterId }]
      return reqs.some((r) => r.userId === myUserId)
    })
    if (pendingDup) {
      await MessagePlugin.warning(`你已经申请过《${song.name || '?'}》,等待管理员审批`)
      return true
    }

    lt.requestSong({
      songmid,
      source,
      name: song.name,
      singer: song.singer,
      cover: (song as any).img,
      albumName: song.albumName,
      albumId: song.albumId !== undefined ? String(song.albumId) : undefined,
      hash: song.hash,
      types: song.types,
      lrc: (song as any).lrc ?? null
    })
    await MessagePlugin.success(`已提交点歌《${song.name || '?'}》,等待管理员审核`)
    return true
  } catch {
    return false
  }
}

/**
 * host/admin 在房间内添加歌曲到共享列表 —— 调 ctl:queue-add 让 server 增量入队
 *
 * 走这条路径而不是 syncRoomContextFromLocal 整体上传是关键:
 * 整体上传会用 host 本地 list 覆盖 server queue,把 member 加的歌全冲掉。
 * ctl:queue-add 只新增一首,server 广播 QUEUE_UPDATE 让所有人(包括 host 自己)
 * 通过 replaceLocalPlaylistFromQueue 同步本地 list。
 */
async function tryAddToQueueAsHost(song: SongList): Promise<boolean> {
  try {
    const { useListenTogetherStore } = await import('@renderer/store')
    const lt = useListenTogetherStore()
    if (!lt.isInRoom || !lt.canControl) return false
    /* 本地预检 —— 同曲已在 queue 立刻提示,避免发到服务端再吃 SONG_ALREADY_QUEUED */
    const songmid = String(song.songmid)
    const source = song.source
    const queueDup = lt.queue.some((q) => q.song?.songmid === songmid && q.song?.source === source)
    if (queueDup) {
      await MessagePlugin.warning(`《${song.name || '?'}》已在播放队列里了`)
      return true
    }
    lt.addToQueue({
      songmid,
      source,
      name: song.name,
      singer: song.singer,
      cover: (song as any).img,
      albumName: song.albumName,
      albumId: song.albumId !== undefined ? String(song.albumId) : undefined,
      hash: song.hash,
      types: song.types,
      lrc: (song as any).lrc ?? null
    })
    return true
  } catch {
    return false
  }
}

// 事件类型定义
type PlaylistEvents = {
  addToPlaylistAndPlay: SongList
  addToPlaylistEnd: SongList
  replacePlaylist: SongList[]
}

// 创建全局事件总线
const emitter = mitt<PlaylistEvents>()

// 将事件总线挂载到全局
;(window as any).musicEmitter = emitter
const qualityMap: Record<string, string> = {
  '128k': '标准音质',
  '192k': '高品音质',
  '320k': '超高品质',
  flac: '无损音质',
  flac24bit: '超高解析',
  hires: '高清臻音',
  atmos: '全景环绕',
  master: '超清母带'
}
/**
 * 获取歌曲真实播放URL
 * @param song 歌曲对象
 * @returns 真实播放URL
 */
export async function getSongRealUrl(song: SongList): Promise<string> {
  try {
    if ((song as any).source === 'local') {
      const id = (song as any).songmid
      const url = await (window as any).api.localMusic.getUrlById(id)
      if (typeof url === 'object' && url?.error) throw new Error(url.error)
      if (typeof url === 'string') return url
      throw new Error('本地歌曲URL获取失败')
    }
    // 服务插件歌曲（如 navidrome）：直接使用 url 字段
    if ((song as any).url && typeof (song as any).url === 'string') {
      return (song as any).url
    }
    const LocalUserDetail = LocalUserDetailStore()
    let quality =
      (LocalUserDetail.userInfo.sourceQualityMap || {})[(song as any).source] ||
      (LocalUserDetail.userSource.quality as string)
    // 读取设置：是否启用缓存
    const settingsStore = useSettingsStore()
    const isCache = settingsStore.settings.autoCacheMusic ?? true

    quality = calculateBestQuality(song.types, quality) || '128k'

    console.log(`使用音质: ${quality} - ${qualityMap[quality]}`)
    if (!LocalUserDetail.userSource.pluginId) throw new Error('插件都不配就想播放，想的倒挺美呢')
    const urlData = await window.api.music.requestSdk('getMusicUrl', {
      pluginId: LocalUserDetail.userSource.pluginId,
      source: song.source,
      songInfo: song as any,
      quality,
      isCache
    })

    // message.success(`使用音质: ${quality} - ${qualityMap[quality]}`)
    if (typeof urlData === 'object' && urlData.error) {
      throw new Error(urlData.error)
    } else {
      return urlData as string
    }
  } catch (error: any) {
    console.error('获取歌曲URL失败,换个插件看看吧:', error)
    throw new Error('获取歌曲播放链接失败' + error.message)
  }
}

const PluginErrorMsgs = [
  '插件都不配就想播放，想的倒挺美呢',
  '插件插件老弟我需要插件',
  '我肚子饿啦，请给我安装一个插件吧',
  '插件呢？插件呢？插件呢？',
  '哥哥~ 你需要安装一个插件来播放歌曲哦~'
]

/**
 * 添加歌曲到播放列表第一项并播放
 * @param song 要添加的歌曲
 * @param localUserStore LocalUserDetail store实例
 * @param playSongCallback 播放歌曲的回调函数
 */
export async function addToPlaylistAndPlay(
  song: SongList,
  localUserStore: any,
  playSongCallback: (song: SongList) => Promise<void>
) {
  /* 一起听 member:不修改本地 list,不调 playSong,直接提交点歌请求 */
  if (await tryRequestSongAsMember(song)) return
  /* 一起听 host/admin:先 ctl:queue-add 让 server 增量入队,广播 QUEUE_UPDATE 同步给
   * 所有成员;不阻塞后续 playSong 切歌流程(切歌走 ctl:change-song 单独的命令)。 */
  void tryAddToQueueAsHost(song)
  if (!localUserStore.userSource.pluginId && song.source !== 'local' && !(song as any).url) {
    MessagePlugin.error(PluginErrorMsgs[Math.floor(Math.random() * PluginErrorMsgs.length)])
    return
  }
  try {
    // 获取当前正在播放的歌曲索引
    const currentId = localUserStore.userInfo?.lastPlaySongId
    const currentIndex =
      currentId !== undefined && currentId !== null
        ? localUserStore.list.findIndex((item: SongList) => item.songmid === currentId)
        : -1

    // 如果目标歌曲已在列表中，先移除以避免重复
    const existingIndex = localUserStore.list.findIndex(
      (item: SongList) => item.songmid === song.songmid
    )
    if (existingIndex !== -1) {
      localUserStore.list.splice(existingIndex, 1)
    }

    if (currentIndex !== -1) {
      // 正在播放：插入到当前歌曲的下一首
      localUserStore.list.splice(currentIndex + 1, 0, song)
    } else {
      // 未在播放：添加到第一位
      localUserStore.addSongToFirst(song)
    }

    // 播放插入的歌曲
    console.log('播放插入的歌曲:', song)
    const playResult = playSongCallback(song)
    if (playResult && typeof playResult.then === 'function') {
      await playResult
    }
  } catch (error: any) {
    console.error('播放失败:', error)
    if (error.message) {
      await MessagePlugin.error('播放失败了: ' + error.message)
      return
    }
    await MessagePlugin.error('播放失败了，可能还没有版权')
  }
}

/**
 * 添加歌曲到播放列表末尾
 * @param song 要添加的歌曲
 * @param localUserStore LocalUserDetail store实例
 */
export async function addToPlaylistEnd(song: SongList, localUserStore: any) {
  /* 一起听 member:走点歌审核,不修改本地 list */
  if (await tryRequestSongAsMember(song)) return
  /* 一起听 host/admin:增量入队 server queue,member 通过 QUEUE_UPDATE 看到 */
  void tryAddToQueueAsHost(song)
  try {
    // 检查歌曲是否已在播放列表中
    const existingIndex = localUserStore.list.findIndex(
      (item: SongList) => item.songmid === song.songmid
    )

    if (existingIndex !== -1) {
      await MessagePlugin.warning('歌曲已在播放列表中')
      return
    }

    // 使用store的方法添加歌曲
    localUserStore.addSong(song)

    await MessagePlugin.success('已添加到播放列表')
  } catch (error) {
    console.error('添加到播放列表失败:', error)
    await MessagePlugin.error('添加失败，请重试')
  }
}

/**
 * 替换整个播放列表
 * @param songs 要替换的歌曲列表
 * @param localUserStore LocalUserDetail store实例
 * @param playSongCallback 播放歌曲的回调函数
 */
export async function replacePlaylist(
  songs: SongList[],
  localUserStore: any,
  playSongCallback: (song: SongList) => Promise<void>
) {
  try {
    if (songs.length === 0) {
      await MessagePlugin.warning('歌曲列表为空')
      return
    }

    /* 一起听 member:批量替换列表语义不适合"点歌"流程,只取第一首作为点歌请求,
     * 其它歌曲忽略 + 提示用户。avoid 改本地共享列表破坏房间同步状态。 */
    const { useListenTogetherStore } = await import('@renderer/store')
    const lt = useListenTogetherStore()
    if (lt.isInRoom && !lt.canControl) {
      const first = songs[0]
      if (first) {
        lt.requestSong({
          songmid: String(first.songmid),
          source: first.source,
          name: first.name,
          singer: first.singer,
          cover: (first as any).img,
          albumName: first.albumName,
          albumId: first.albumId !== undefined ? String(first.albumId) : undefined,
          hash: first.hash,
          types: first.types,
          lrc: (first as any).lrc ?? null
        })
        await MessagePlugin.success(
          `已提交点歌《${first.name || '?'}》,等待管理员审核(房间内一次只能点一首)`
        )
      }
      return
    }

    localUserStore.replaceSongList(songs)

    /* 一起听 host/admin:整体替换共享列表是明确意图(用户换了个歌单),需要把整个 list
     * 同步到 server queue 让 member 看到。走 syncRoomContextFromLocal 整体上传。
     * 已加 canControl 守卫(上面 member 路径已早 return)。 */
    if (lt.isInRoom && lt.canControl) {
      await lt.syncRoomContextFromLocal({ queueOnly: true })
    }

    // 播放第一首歌曲
    if (songs[0]) {
      const playResult = playSongCallback(songs[0])
      if (playResult && typeof playResult.then === 'function') {
        await playResult
      }
    }

    await MessagePlugin.success(`已用 ${songs.length} 首歌曲替换播放列表`)
  } catch (error: any) {
    console.error('替换播放列表失败:', error)
    if (error.message) {
      await MessagePlugin.error('替换失败: ' + error.message)
      return
    }
    await MessagePlugin.error('替换播放列表失败，请重试')
  }
}

/**
 * 初始化播放列表事件监听器
 * @param localUserStore LocalUserDetail store实例
 * @param playSongCallback 播放歌曲的回调函数
 */
export function initPlaylistEventListeners(
  localUserStore: any,
  playSongCallback: (song: SongList) => Promise<void>
) {
  // 监听添加到播放列表并播放的事件
  emitter.on('addToPlaylistAndPlay', async (song: SongList) => {
    await addToPlaylistAndPlay(song, localUserStore, playSongCallback)
  })

  // 监听添加到播放列表末尾的事件
  emitter.on('addToPlaylistEnd', async (song: SongList) => {
    await addToPlaylistEnd(song, localUserStore)
  })

  // 监听替换播放列表的事件
  emitter.on('replacePlaylist', async (songs: SongList[]) => {
    await replacePlaylist(songs, localUserStore, playSongCallback)
  })
}

/**
 * 清理播放列表事件监听器
 */
export function destroyPlaylistEventListeners() {
  emitter.off('addToPlaylistAndPlay')
  emitter.off('addToPlaylistEnd')
  emitter.off('replacePlaylist')
}

/**
 * 触发添加歌曲到播放列表并播放的事件
 * @param song 要添加的歌曲
 */
export function triggerAddToPlaylistAndPlay(song: SongList) {
  emitter.emit('addToPlaylistAndPlay', song)
}

/**
 * 触发添加歌曲到播放列表末尾的事件
 * @param song 要添加的歌曲
 */
export function triggerAddToPlaylistEnd(song: SongList) {
  emitter.emit('addToPlaylistEnd', song)
}

/**
 * 获取全局事件总线实例
 */
export function getPlaylistEmitter() {
  return emitter
}

/**
 * 将搜索结果转换为SongList格式
 * @param searchResult 搜索结果中的歌曲数据
 * @returns 转换后的SongList对象
 */
export function convertSearchResultToSongList(searchResult: any): SongList {
  return searchResult
}
