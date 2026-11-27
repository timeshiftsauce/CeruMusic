import wave from '@renderer/assets/lanyin-stickers/16.gif'
import salute from '@renderer/assets/lanyin-stickers/17.gif'
import thanks from '@renderer/assets/lanyin-stickers/18.gif'
import heart from '@renderer/assets/lanyin-stickers/19.gif'
import laugh from '@renderer/assets/lanyin-stickers/20.gif'
import cry from '@renderer/assets/lanyin-stickers/21.gif'
import angry from '@renderer/assets/lanyin-stickers/22.gif'
import surprised from '@renderer/assets/lanyin-stickers/23.gif'
import cheer from '@renderer/assets/lanyin-stickers/24.gif'
import encourage from '@renderer/assets/lanyin-stickers/25.gif'
import peek from '@renderer/assets/lanyin-stickers/26.gif'
import sleep from '@renderer/assets/lanyin-stickers/27.gif'
import listen from '@renderer/assets/lanyin-stickers/28.gif'
import repeat from '@renderer/assets/lanyin-stickers/29.gif'
import identify from '@renderer/assets/lanyin-stickers/30.gif'
import recommend from '@renderer/assets/lanyin-stickers/31.gif'
import morning from '@renderer/assets/lanyin-stickers/32.gif'
import hug from '@renderer/assets/lanyin-stickers/33.gif'
import headphones from '@renderer/assets/lanyin-stickers/34.gif'
import skipTrack from '@renderer/assets/lanyin-stickers/35.gif'
import shy from '@renderer/assets/lanyin-stickers/36.gif'
import applause from '@renderer/assets/lanyin-stickers/37.gif'
import tea from '@renderer/assets/lanyin-stickers/38.gif'
import idea from '@renderer/assets/lanyin-stickers/39.gif'
import drums from '@renderer/assets/lanyin-stickers/40.gif'
import favorite from '@renderer/assets/lanyin-stickers/41.gif'
import type { Sticker } from './stickers'

export const LANYIN_STICKERS: Sticker[] = [
  { id: 'sticker-16', label: '嗨', src: wave },
  { id: 'sticker-17', label: '收到', src: salute },
  { id: 'sticker-18', label: '谢谢', src: thanks },
  { id: 'sticker-19', label: '比心', src: heart },
  { id: 'sticker-20', label: '笑死啦', src: laugh },
  { id: 'sticker-21', label: '呜呜', src: cry },
  { id: 'sticker-22', label: '气鼓鼓', src: angry },
  { id: 'sticker-23', label: '诶', src: surprised },
  { id: 'sticker-24', label: '好耶', src: cheer },
  { id: 'sticker-25', label: '加油', src: encourage },
  { id: 'sticker-26', label: '蹲个更新', src: peek },
  { id: 'sticker-27', label: '晚安', src: sleep },
  { id: 'sticker-28', label: '一起听', src: listen },
  { id: 'sticker-29', label: '单曲循环', src: repeat },
  { id: 'sticker-30', label: '求歌名', src: identify },
  { id: 'sticker-31', label: '安利你', src: recommend },
  { id: 'sticker-32', label: '早安', src: morning },
  { id: 'sticker-33', label: '抱抱', src: hug },
  { id: 'sticker-34', label: '戴上耳机', src: headphones },
  { id: 'sticker-35', label: '切歌', src: skipTrack },
  { id: 'sticker-36', label: '害羞', src: shy },
  { id: 'sticker-37', label: '鼓掌', src: applause },
  { id: 'sticker-38', label: '喝口茶', src: tea },
  { id: 'sticker-39', label: '灵感来了', src: idea },
  { id: 'sticker-40', label: '打个节拍', src: drums },
  { id: 'sticker-41', label: '收藏啦', src: favorite }
]

// 编辑时显示中文名称，发布后复用评论贴纸的固定编号。
export function lanyinStickerLabel(sticker: Sticker): string {
  return `[澜音娘·${sticker.label}]`
}

const byLabel = new Map(LANYIN_STICKERS.map((s) => [lanyinStickerLabel(s), s]))
const byToken = new Map(LANYIN_STICKERS.map((s) => [`[${s.id}]`, s]))

export function encodeNoteStickers(text: string): string {
  return text.replace(/\[澜音娘·[^\[\]\n]+\]/g, (label) => {
    const sticker = byLabel.get(label)
    return sticker ? `[${sticker.id}]` : label
  })
}

export function decodeNoteStickers(text: string): string {
  return text.replace(/\[sticker-\d+\]/g, (token) => {
    const sticker = byToken.get(token)
    return sticker ? lanyinStickerLabel(sticker) : token
  })
}
