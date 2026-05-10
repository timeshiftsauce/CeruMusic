/**
 * SongRef 与 SongList 之间的双向转换工具
 *
 * 用途：
 *  - member 端收到远端 SongRef -> 转 SongList 喂给 playSong / 显示在 UI
 *  - host 端从 GlobalPlayStatus.songInfo 取 SongList -> 转 SongRef 广播到房间
 *
 * 设计原则：
 *  - 用 JSON.parse(JSON.stringify()) 去掉 reactive Proxy，避免后续 IPC
 *    序列化失败（结构化克隆不支持 Proxy）
 *  - SongRef 缺失字段时 SongList 用空串 / 空数组兜底，保持下游代码零分支
 */

import type { SongList } from '@renderer/types/audio'
import type { SongRef } from './types'

/** 把秒数格式化为 mm:ss —— SongList.interval 期望的格式 */
function formatInterval(seconds: number | undefined): string {
  if (!seconds || !isFinite(seconds)) return ''
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

/**
 * SongRef → SongList
 *
 * 输出对象用 JSON 反 reactive 处理，确保返回的是纯 plain object，
 * 可以安全传给 playSong / IPC / 写到其它响应式状态中。
 */
export function songRefToSongList(ref: SongRef): SongList {
  return JSON.parse(
    JSON.stringify({
      songmid: ref.songmid,
      source: ref.source,
      name: ref.name || '',
      singer: ref.singer || '',
      albumName: ref.albumName || '',
      albumId: ref.albumId || '',
      interval: formatInterval(ref.duration),
      img: ref.cover || '',
      hash: ref.hash,
      lrc: ref.lrc ?? null,
      types: ref.types || [],
      _types: {}
    })
  )
}

/**
 * SongList → SongRef
 *
 * 将本地播放列表的 SongList 转换为可以在网络传输的 SongRef
 */
export function songListToSongRef(song: SongList): SongRef {
  // 把 mm:ss 格式转成秒数
  let duration = 0
  if (song.interval) {
    const parts = song.interval.split(':')
    if (parts.length === 2) {
      duration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
    }
  }

  return JSON.parse(
    JSON.stringify({
      songmid: song.songmid,
      source: song.source,
      name: song.name,
      singer: song.singer,
      cover: song.img,
      duration: duration || undefined,
      albumName: song.albumName,
      albumId: song.albumId,
      hash: song.hash,
      lrc: song.lrc,
      types: song.types
    })
  )
}
