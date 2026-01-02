import mitt from 'mitt'
import { MessagePlugin } from 'tdesign-vue-next'
import type { SongList } from '@renderer/types/audio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'

// 事件类型定义
type PlaylistEvents = {
  addToPlaylistAndPlay: SongList
  addToPlaylistEnd: SongList
  replacePlaylist: SongList[]
}

// 创建全局事件总线
const emitter = mitt<PlaylistEvents>()

  // 将事件总线挂载到全局
  ; (window as any).musicEmitter = emitter
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
const qualityKey = Object.keys(qualityMap)
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
    const LocalUserDetail = LocalUserDetailStore()
    let quality =
      (LocalUserDetail.userInfo.sourceQualityMap || {})[(song as any).source] ||
      (LocalUserDetail.userSource.quality as string)
    // 读取设置：是否启用缓存
    const settingsStore = useSettingsStore()
    const isCache = settingsStore.settings.autoCacheMusic ?? true

    if (
      qualityKey.indexOf(quality) >
      qualityKey.indexOf((song.types[song.types.length - 1] as unknown as { type: any }).type)
    ) {
      quality = (song.types[song.types.length - 1] as unknown as { type: any }).type
    }

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
  if (!localUserStore.userSource.pluginId) {
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

    localUserStore.replaceSongList(songs)

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
