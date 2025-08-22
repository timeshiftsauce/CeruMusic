import mitt from 'mitt'
import { MessagePlugin } from 'tdesign-vue-next'
import type { SongList } from '@renderer/types/audio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

// 事件类型定义
type PlaylistEvents = {
  addToPlaylistAndPlay: SongList
  addToPlaylistEnd: SongList
}

// 创建全局事件总线
const emitter = mitt<PlaylistEvents>()

// 将事件总线挂载到全局
;(window as any).musicEmitter = emitter

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
    const urlData = await window.api.music.requestSdk('getMusicUrl',{
      pluginId:(LocalUserDetail.userSource.pluginId as unknown as string),
      source: song.source,
      songInfo:song,
      quality: LocalUserDetail.userSource.quality as string
    })
    console.log(urlData)
    if (typeof urlData === 'object'&&urlData.error) {
      throw new Error(urlData.error)
    }else{
      return urlData as string
    }
  } catch (error:any) {
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
    // 使用store的方法添加歌曲到第一位
    localUserStore.addSongToFirst(song)

    // 获取真实播放URL
    await getSongRealUrl(song)

    // 播放歌曲 - 确保正确处理Promise
    const playResult = playSongCallback(song)
    if (playResult && typeof playResult.then === 'function') {
      await playResult
    }

    await MessagePlugin.success('已添加到播放列表并开始播放')
  } catch (error) {
    console.error('添加到播放列表并播放失败:', error)
    await MessagePlugin.error('播放失败，请重试')
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
    const existingIndex = localUserStore.list.findIndex((item: SongList) => item.songmid === song.songmid)

    if (existingIndex !== -1) {
      await MessagePlugin.warning('歌曲已在播放列表中')
      return
    }

    // 使用store的方法添加歌曲
    localUserStore.addSong(song)

    // 预加载歌曲URL（可选，提升用户体验）
    try {
      await getSongRealUrl(song)
    } catch (error) {
      console.warn('预加载歌曲URL失败:', error)
      // 预加载失败不影响添加到播放列表
    }

    await MessagePlugin.success('已添加到播放列表')
  } catch (error) {
    console.error('添加到播放列表失败:', error)
    await MessagePlugin.error('添加失败，请重试')
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
}

/**
 * 清理播放列表事件监听器
 */
export function destroyPlaylistEventListeners() {
  emitter.off('addToPlaylistAndPlay')
  emitter.off('addToPlaylistEnd')
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
