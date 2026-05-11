/**
 * 分享链接解析 + 卡片元数据缓存
 *
 * 聊天里发的 https://ceru.share.shiqianjiang.cn/<id> (单曲) 或
 * https://ceru.share.shiqianjiang.cn/p/<id> (歌单) 链接,本模块负责:
 *  1. 从消息正文里识别链接,抽出 cardType + cardId,塞进 meta 透传给所有端
 *  2. 接收端调 /share API 拉详情;同一 id 在内存里缓存,避免重复请求
 *
 * 为什么走内存缓存而不是 store:卡片详情大半是只读静态信息,且只在浮层可见时
 * 用到,没必要走全局响应式;Map 单例足够,组件用 reactive ref 自己持有引用。
 */

import { shareAPI, type ShareDetail, type PlaylistShareDetail } from '@renderer/api/share'

const SHARE_HOST = 'ceru.share.shiqianjiang.cn'

export type CardType = 'song' | 'playlist'

export interface ShareLinkRef {
  cardType: CardType
  cardId: string
}

/**
 * 从一段文本里找第一个 ceru 分享链接,识别成歌单/单曲
 *
 * 匹配规则:
 *   /p/<id>  → playlist
 *   /<id>    → song (id 必须是 6-20 字 alphanum,不能是 'p')
 *
 * 只匹配一次 —— 一条消息里同时贴多个分享比较罕见,先简化处理。
 */
export function parseShareLink(text: string): ShareLinkRef | null {
  if (!text) return null
  /* 用 RegExp 直接扫,避免 URL 构造异常 */
  const playlistRe = new RegExp(
    `https?://${SHARE_HOST.replace(/\./g, '\\.')}/p/([A-Za-z0-9_-]{4,32})`,
    'i'
  )
  const m1 = text.match(playlistRe)
  if (m1) return { cardType: 'playlist', cardId: m1[1] }

  const songRe = new RegExp(
    `https?://${SHARE_HOST.replace(/\./g, '\\.')}/([A-Za-z0-9_-]{4,32})(?![A-Za-z0-9_-])`,
    'i'
  )
  const m2 = text.match(songRe)
  if (m2 && m2[1] !== 'p') return { cardType: 'song', cardId: m2[1] }
  return null
}

/* ---------------- 元数据缓存 ---------------- */

const songCache = new Map<string, Promise<ShareDetail | null>>()
const playlistCache = new Map<string, Promise<PlaylistShareDetail | null>>()

export function fetchSongShare(id: string): Promise<ShareDetail | null> {
  let p = songCache.get(id)
  if (!p) {
    p = shareAPI.getById(id).catch(() => null)
    songCache.set(id, p)
  }
  return p
}

export function fetchPlaylistShare(id: string): Promise<PlaylistShareDetail | null> {
  let p = playlistCache.get(id)
  if (!p) {
    /* 拉 3 首预览就够卡片渲染 —— 整列表延后到用户点进歌单页才请求 */
    p = shareAPI.getPlaylistById(id, 3, 0).catch(() => null)
    playlistCache.set(id, p)
  }
  return p
}
