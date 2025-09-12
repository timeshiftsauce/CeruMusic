import mitt from 'mitt'
import { MessagePlugin } from 'tdesign-vue-next'
import type { SongList } from '@renderer/types/audio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

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
const qualityKey = Object.keys(qualityMap)
/**
 * 获取歌曲真实播放URL
 * @param song 歌曲对象
 * @returns 真实播放URL
 */
export async function getSongRealUrl(song: SongList): Promise<string> {
  try {
    // 获取当前用户的信息
    const LocalUserDetail = LocalUserDetailStore()
    // 通过统一的request方法获取真实的播放URL
    let quality = LocalUserDetail.userSource.quality as string
    if (
      qualityKey.indexOf(quality) >
      qualityKey.indexOf((song.types[song.types.length - 1] as unknown as { type: any }).type)
    ) {
      quality = (song.types[song.types.length - 1] as unknown as { type: any }).type
    }
    console.log(quality)
    const urlData = await window.api.music.requestSdk('getMusicUrl', {
      pluginId: LocalUserDetail.userSource.pluginId as unknown as string,
      source: song.source,
      songInfo: song as any,
      quality
    })
    console.log(urlData)
    if (typeof urlData === 'object' && urlData.error) {
      throw new Error(urlData.error)
    } else {
      return urlData as string
    }
  } catch (error: any) {
    console.error('获取歌曲URL失败:', error)
    throw new Error('获取歌曲播放链接失败' + error.message)
  }
}

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
  try {
    // 获取真实播放URL

    await getSongRealUrl(song)
    const playResult = playSongCallback(song)

    // 使用store的方法添加歌曲到第一位
    localUserStore.addSongToFirst(song)

    // 播放歌曲 - 确保正确处理Promise
    if (playResult && typeof playResult.then === 'function') {
      await playResult
    }

    await MessagePlugin.success('已添加到播放列表并开始播放')
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

    // 清空当前播放列表
    localUserStore.list.length = 0

    // 添加所有歌曲到播放列表
    songs.forEach((song) => {
      localUserStore.addSong(song)
    })

    // 播放第一首歌曲
    if (songs[0]) {
      await getSongRealUrl(songs[0])
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
