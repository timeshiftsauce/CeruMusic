/**
 * 一起听 mention 判定 —— 统一逻辑供 store 系统通知 / 软件内通知 复用
 *
 * 判定规则:
 *  1) meta.mentions 显式包含我的 userId        → mention
 *  2) meta.replyToId 指向的历史消息发送者是我 → mention(引用自动 @)
 *
 * 抽出来避免 store 和 LtChatToast 两边写一份还对不上。
 */

import type { ChatMsg } from './types'

export function isMentionedSelf(
  msg: ChatMsg,
  myUserId: string | undefined | null,
  history: ChatMsg[]
): boolean {
  if (!myUserId) return false

  /* 1) 显式 @ */
  const mentions = (msg.meta?.mentions || '').split(',').filter(Boolean)
  if (mentions.includes(myUserId)) return true

  /* 2) 引用了我的消息 */
  const replyToId = msg.meta?.replyToId
  if (replyToId) {
    const replied = history.find((c) => c.id === replyToId)
    if (replied?.from?.userId === myUserId) return true
  }

  return false
}
