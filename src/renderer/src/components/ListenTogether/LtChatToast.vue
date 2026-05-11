<script setup lang="ts">
/**
 * 一起听 dialog 通知 —— FullPlay 未展开时把新聊天消息以右下角通知卡片弹出
 *
 * 分工:
 *  - FullPlay 展开 → 由 LtDanmakuLayer 飘弹幕(挂在 FullPlay 内部)
 *  - FullPlay 收起 → 由本组件走 NotifyPlugin 右下角卡片(挂在 App.vue 全局)
 *
 * 用 NotifyPlugin 而不是 MessagePlugin:
 *  - MessagePlugin 是顶部条状 toast,太轻、显示时间短,易被忽略
 *  - NotifyPlugin 是右下角通知卡片,带头像/标题/内容,信息量更大且不挡操作
 *
 * 节流:
 *  - 同时最多 3 条排队
 *  - 单条显示 3.5s,相邻通知至少间隔 800ms 启动
 *  - 缓冲超过上限时,后续消息合并为 "N 条新消息(最近: ...)" 弹一条
 *
 * 不弹的消息:
 *  - 自己发的
 *  - 系统消息 / 贴纸
 *  - FullPlay 展开时(弹幕负责)
 *  - 不在房间内
 *  - 一起听浮层正在显示
 */
import { onBeforeUnmount, watch } from 'vue'
import { NotifyPlugin } from 'tdesign-vue-next'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import type { ChatMsg } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()

/** 单条通知显示时长 */
const NOTIFY_DURATION_MS = 3500
/** 相邻通知启动间隔(节流) */
const NOTIFY_GAP_MS = 800
/** 同时排队的最大条数 —— 超出合并为 "N 条新消息" */
const QUEUE_LIMIT = 3
/** 单条预览裁剪 */
const PREVIEW_MAX = 60

interface PendingNotify {
  title: string
  content: string
}

const queue: PendingNotify[] = []
const seenIds = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let lastFiredAt = 0

function buildNotify(msg: ChatMsg): PendingNotify {
  const name = msg.from?.nickname || '某人'
  const raw = msg.content || ''
  const truncated = raw.length > PREVIEW_MAX ? raw.slice(0, PREVIEW_MAX) + '…' : raw
  const roomName = lt.meta?.name || '一起听'
  return {
    title: `${name} · ${roomName}`,
    content: truncated
  }
}

function fire(n: PendingNotify): void {
  /* placement 右下角 —— 不挡上方播放器和侧边栏 */
  NotifyPlugin.info({
    title: n.title,
    content: n.content,
    duration: NOTIFY_DURATION_MS,
    placement: 'bottom-right',
    closeBtn: true
  })
  lastFiredAt = Date.now()
}

function scheduleFlush(): void {
  if (flushTimer) return
  const wait = Math.max(0, lastFiredAt + NOTIFY_GAP_MS - Date.now())
  flushTimer = setTimeout(() => {
    flushTimer = null
    fireNext()
  }, wait)
}

function fireNext(): void {
  if (queue.length === 0) return
  /* 缓冲过深 → 合并成单条摘要,把队列清空 */
  if (queue.length > QUEUE_LIMIT) {
    const last = queue[queue.length - 1]
    const count = queue.length
    queue.length = 0
    fire({
      title: `${lt.meta?.name || '一起听'} · ${count} 条新消息`,
      content: `最近：${last.content}`
    })
  } else {
    fire(queue.shift()!)
  }
  if (queue.length > 0) scheduleFlush()
}

function enqueue(msg: ChatMsg): void {
  queue.push(buildNotify(msg))
  scheduleFlush()
}

function primeSeen(): void {
  for (const m of lt.chat) seenIds.add(m.id)
}

const stopChatWatch = watch(
  () => lt.chat.length,
  () => {
    /* 仅在"未展开 FullPlay 且在房间内 且面板没开"时走通知卡片 */
    if (lt.fullPlayVisible || !lt.isInRoom || lt.overlayVisible) {
      for (const m of lt.chat) seenIds.add(m.id)
      return
    }
    for (const m of lt.chat) {
      if (seenIds.has(m.id)) continue
      seenIds.add(m.id)
      if (m.type === 'system' || m.type === 'sticker') continue
      if (!m.content) continue
      if (m.from?.userId && m.from.userId === lt.myUserId) continue
      enqueue(m)
    }
  }
)

const stopRoomWatch = watch(
  () => lt.isInRoom,
  (inRoom) => {
    if (!inRoom) {
      queue.length = 0
      seenIds.clear()
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
    } else {
      primeSeen()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopChatWatch()
  stopRoomWatch()
  if (flushTimer) clearTimeout(flushTimer)
})
</script>

<template>
  <!-- 纯副作用组件,放一个隐藏锚点满足 Vue template root 要求 -->
  <span hidden></span>
</template>
