<script setup lang="ts">
/**
 * 一起听弹幕层 —— 监听房间聊天,把新消息以弹幕形式飘过播放界面
 *
 * 设计:
 *  - 只显示房间内的 text/emoji 聊天(不含系统消息),来自他人和自己的都显示
 *  - 多轨道(默认 5)避免重叠;新弹幕选最早可用的轨道
 *  - 单条弹幕从右往左飘 ~10s,飘完自动清理
 *  - 跟随 lt.chat 数组:监听新增项,不重放历史(进房时已有的不弹)
 *  - 同一时刻多条:每个弹幕独立 lifetime,内部自维持 list,UI 用 v-for 渲染
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useListenTogetherStore } from '@renderer/store'
import type { ChatMsg } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()

interface DanmakuItem {
  id: string
  /** 显示文本 */
  text: string
  /** 头像 URL,可选 */
  avatar?: string
  /** 显示昵称(自己则带"你") */
  nickname: string
  /** 是否自己发的 —— UI 用主题色高亮 */
  isSelf: boolean
  /** 轨道索引 0..N-1 */
  track: number
  /** 飘过总时长(ms),用于 CSS animation duration */
  duration: number
  /** 启动时间戳,用于辅助清理判断 */
  startedAt: number
}

const TRACK_COUNT = 5
const FLY_DURATION_MS = 10_000
/** 同一轨道的最小间隔时间(ms),给新弹幕留追上前面那条的"安全距离" */
const TRACK_COOLDOWN_MS = 2200

/** 当前正在飞的弹幕 */
const flying = ref<DanmakuItem[]>([])

/** 每条轨道上次发出弹幕的时间戳;选轨道时挑最久没发的那条 */
const trackLastUsedAt = ref<number[]>(new Array(TRACK_COUNT).fill(0))

/** 清理 timer 集合,组件销毁时取消 */
const cleanupTimers = new Set<ReturnType<typeof setTimeout>>()

/** 已处理过的 chat id —— 进房时 lt.chat 内已有的历史不重放 */
const seenIds = ref<Set<string>>(new Set())

/** 启动时把当前 chat 中已有的标记为 seen,避免历史消息瞬间一波弹幕 */
function primeSeenSet(): void {
  for (const m of lt.chat) seenIds.value.add(m.id)
}

/** 取一条最久未使用的轨道,均衡分布避免某条轨道堆叠 */
function pickTrack(): number {
  const now = Date.now()
  let bestIdx = 0
  let bestAge = -1
  for (let i = 0; i < TRACK_COUNT; i++) {
    const age = now - trackLastUsedAt.value[i]
    if (age > bestAge) {
      bestAge = age
      bestIdx = i
    }
  }
  /* 若最佳轨道也在冷却期内,仍然使用它(避免完全丢消息),
   * 但 trackLastUsedAt 用 max(now, last+cooldown) 让下一条更晚 */
  trackLastUsedAt.value[bestIdx] = Math.max(now, trackLastUsedAt.value[bestIdx] + TRACK_COOLDOWN_MS)
  return bestIdx
}

function spawn(msg: ChatMsg): void {
  if (msg.type === 'system') return
  if (!msg.content) return

  const isSelf = Boolean(msg.from?.userId && msg.from.userId === lt.myUserId)
  const nickname = msg.from?.nickname || '匿名'

  const item: DanmakuItem = {
    id: msg.id,
    text: msg.content.slice(0, 80), // 防超长
    avatar: msg.from?.avatar,
    nickname,
    isSelf,
    track: pickTrack(),
    duration: FLY_DURATION_MS,
    startedAt: Date.now()
  }
  flying.value.push(item)

  /* 飞完后自动从 list 移除 —— 加 500ms 缓冲避免动画结束瞬间 reactivity race */
  const timer = setTimeout(() => {
    cleanupTimers.delete(timer)
    flying.value = flying.value.filter((d) => d.id !== item.id)
  }, FLY_DURATION_MS + 500)
  cleanupTimers.add(timer)
}

/* 监听 chat 数组变化:只处理新增项 */
const stopWatch = watch(
  () => lt.chat.length,
  () => {
    for (const m of lt.chat) {
      if (seenIds.value.has(m.id)) continue
      seenIds.value.add(m.id)
      /* 仅在房间内 + 是文本/emoji 才弹 */
      if (lt.isInRoom && (m.type === 'text' || m.type === 'emoji')) {
        spawn(m)
      }
    }
  }
)

/* 离房清空:历史消息和飞行中的都清,下次进房从干净状态重新积累 */
const stopRoomWatch = watch(
  () => lt.isInRoom,
  (inRoom) => {
    if (!inRoom) {
      flying.value = []
      seenIds.value = new Set()
      cleanupTimers.forEach(clearTimeout)
      cleanupTimers.clear()
    } else {
      primeSeenSet()
    }
  },
  { immediate: true }
)

const visible = computed(() => lt.isInRoom)

onBeforeUnmount(() => {
  stopWatch()
  stopRoomWatch()
  cleanupTimers.forEach(clearTimeout)
  cleanupTimers.clear()
})
</script>

<template>
  <div v-if="visible" class="lt-danmaku-layer" aria-hidden="true">
    <div
      v-for="d in flying"
      :key="d.id"
      class="lt-danmaku-item"
      :class="{ self: d.isSelf }"
      :style="{
        top: `calc(${(d.track / TRACK_COUNT) * 100}% + 8px)`,
        animationDuration: `${d.duration}ms`
      }"
    >
      <img
        v-if="d.avatar"
        class="lt-danmaku-avatar"
        :src="d.avatar"
        alt=""
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <span class="lt-danmaku-name">{{ d.nickname }}</span>
      <span class="lt-danmaku-sep">:</span>
      <span class="lt-danmaku-text">{{ d.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.lt-danmaku-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 5;
}

.lt-danmaku-item {
  position: absolute;
  left: 100%;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.42);
  color: rgba(255, 255, 255, 0.94);
  font-size: 14px;
  line-height: 1.2;
  white-space: nowrap;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18);
  animation-name: lt-danmaku-fly;
  animation-timing-function: linear;
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
  /* 一些字体在 inline-flex 下贴边,留点视觉缓冲 */
  max-width: 70%;
  text-overflow: ellipsis;
  overflow: hidden;
}

.lt-danmaku-item.self {
  background: rgba(64, 158, 255, 0.55);
  color: #fff;
}

.lt-danmaku-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.lt-danmaku-name {
  font-weight: 600;
  opacity: 0.92;
}

.lt-danmaku-sep {
  opacity: 0.6;
}

.lt-danmaku-text {
  opacity: 0.95;
}

@keyframes lt-danmaku-fly {
  from {
    transform: translateX(0);
  }
  to {
    /* -100% 是元素自身宽度,加 -100vw 让它走完整个容器宽 */
    transform: translateX(calc(-100% - 100vw));
  }
}
</style>
