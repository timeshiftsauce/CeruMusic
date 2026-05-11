<script setup lang="ts">
/**
 * 一起听 Toast —— FullPlay 未展开时把新聊天消息以 MessagePlugin 浮层弹出
 *
 * 分工:
 *  - FullPlay 展开 → 由 LtDanmakuLayer 飘弹幕(挂在 FullPlay 内部)
 *  - FullPlay 收起 → 由本组件走 MessagePlugin toast(挂在 App.vue 全局)
 *
 * 节流:
 *  - 同时最多 3 条 toast 排队(MessagePlugin 自身没节流,不限制会堆很多)
 *  - 单条 toast 显示 3s,相邻 toast 至少间隔 800ms 启动
 *  - 缓冲超过上限时,后续消息合并为 "N 条新消息(最近: ...)" 弹一条
 *
 * 不弹的消息:
 *  - 自己发的(本来就在自己 UI 上输入的)
 *  - 系统消息(member-join 等,与正常聊天不同语义)
 *  - FullPlay 展开时(弹幕负责)
 *  - 不在房间内
 *  - 一起听浮层正在显示(虽然 overlay 挂在 FullPlay 里,但留一道防线)
 */
import { onBeforeUnmount, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import type { ChatMsg } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()

/** 单条 toast 显示时长 */
const TOAST_DURATION_MS = 3000
/** 相邻 toast 启动间隔(节流) */
const TOAST_GAP_MS = 800
/** 同时排队的最大条数 —— 超出合并为 "N 条新消息" */
const QUEUE_LIMIT = 3
/** 单条预览裁剪 */
const PREVIEW_MAX = 36

interface PendingToast {
  preview: string
}

const queue: PendingToast[] = []
const seenIds = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let lastFiredAt = 0

function formatPreview(msg: ChatMsg): string {
  const name = msg.from?.nickname || '某人'
  const raw = msg.content || ''
  const truncated = raw.length > PREVIEW_MAX ? raw.slice(0, PREVIEW_MAX) + '…' : raw
  return `${name}: ${truncated}`
}

function scheduleFlush(): void {
  if (flushTimer) return
  const wait = Math.max(0, lastFiredAt + TOAST_GAP_MS - Date.now())
  flushTimer = setTimeout(() => {
    flushTimer = null
    fireNext()
  }, wait)
}

function fireNext(): void {
  if (queue.length === 0) return
  /* 缓冲过深 → 合并成单条摘要,把队列清空 */
  if (queue.length > QUEUE_LIMIT) {
    const last = queue[queue.length - 1].preview
    const count = queue.length
    queue.length = 0
    MessagePlugin.info({
      content: `一起听 · ${count} 条新消息  最近：${last}`,
      duration: TOAST_DURATION_MS
    })
  } else {
    const next = queue.shift()!
    MessagePlugin.info({
      content: next.preview,
      duration: TOAST_DURATION_MS
    })
  }
  lastFiredAt = Date.now()
  if (queue.length > 0) scheduleFlush()
}

function enqueue(msg: ChatMsg): void {
  queue.push({ preview: formatPreview(msg) })
  scheduleFlush()
}

function primeSeen(): void {
  for (const m of lt.chat) seenIds.add(m.id)
}

const stopChatWatch = watch(
  () => lt.chat.length,
  () => {
    /* 仅在"未展开 FullPlay 且在房间内 且面板没开"时走 toast */
    if (lt.fullPlayVisible || !lt.isInRoom || lt.overlayVisible) {
      /* 当前不走 toast → 把新增的 id 当作已见,避免之后切到这个模式时一次性补弹 */
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

/* 离房清理 —— 队列、计时器、已见集合都重置;再次进房从干净状态开始 */
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
  <!-- 纯副作用组件;放一个隐藏锚点满足 Vue template root 要求 -->
  <span hidden></span>
</template>
