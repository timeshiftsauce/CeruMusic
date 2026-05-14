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
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import { useListenTogetherSettingsStore } from '@renderer/store/ListenTogetherSettings'
import type { ChatMsg } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()
const ltSettings = useListenTogetherSettingsStore()

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
  /** 飘过总时长(ms),每条独立 —— 模拟 B 站快慢不一的随机感 */
  duration: number
  /** 字号(px)—— 13/14/15/16 微抖动 */
  fontSize: number
  /** 启动时间戳,用于辅助清理判断 */
  startedAt: number
}

/* 范围:layer 占据"歌词区"—— 顶部操作栏下方到播放器一半之间。
 * 8 条轨道在这个高度区间均匀分布。 */
const TRACK_COUNT = 8
/** 同轨道最小冷却(ms)—— 给前一条留追赶距离,~1.0s */
const TRACK_COOLDOWN_MS = 1000
/** 在"最早可用"的前 N 条轨道里随机选,B 站风格的凌乱感 */
const TRACK_RANDOM_TOP_K = 5
/** 飞行时长随机区间 [min, max] —— 不同速度,有快有慢 */
const FLY_DURATION_MIN_MS = 6500
const FLY_DURATION_MAX_MS = 11000
/** 字号候选值 —— 低视觉负担,默认偏小 */
const FONT_SIZES = [12, 13, 14]

/** 当前正在飞的弹幕 */
const flying = ref<DanmakuItem[]>([])

/** 每条轨道上次发出弹幕的时间戳;选轨道时挑最早的几条里随机 */
const trackLastUsedAt = ref<number[]>(new Array(TRACK_COUNT).fill(0))

/** 清理 timer 集合,组件销毁时取消 */
const cleanupTimers = new Set<ReturnType<typeof setTimeout>>()

/** 已处理过的 chat id —— 进房时 lt.chat 内已有的历史不重放 */
const seenIds = ref<Set<string>>(new Set())

/** 启动时把当前 chat 中已有的标记为 seen,避免历史消息瞬间一波弹幕 */
function primeSeenSet(): void {
  for (const m of lt.chat) seenIds.value.add(m.id)
}

/**
 * 瀑布流式选轨道 —— 取"上次使用最早"的前 K 条轨道里随机选 1 条
 *
 * 模拟瀑布流"挑最短列"语义:trackLastUsedAt 越早 = 该轨道弹幕飘得越远 =
 * 该轨道剩余可用空间越大。在 top-K 中随机选避免每次都是同一条造成视觉规整。
 */
function pickTrack(): number {
  const now = Date.now()
  const indexed = trackLastUsedAt.value.map((t, i) => ({ i, t }))
  indexed.sort((a, b) => a.t - b.t)
  const k = Math.min(TRACK_RANDOM_TOP_K, indexed.length)
  const pick = indexed[Math.floor(Math.random() * k)].i
  /* 若选中的轨道仍在冷却内,把 lastUsed 推到 now+cooldown 给后续条更晚的时间戳 */
  trackLastUsedAt.value[pick] = Math.max(now, trackLastUsedAt.value[pick] + TRACK_COOLDOWN_MS)
  return pick
}

function randInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function spawn(msg: ChatMsg): void {
  if (msg.type === 'system') return
  if (!msg.content) return
  /* 用户在设置里关掉弹幕时,不再生成 —— 已飞的会自然飘完 */
  if (!ltSettings.enableDanmaku) return

  const isSelf = Boolean(msg.from?.userId && msg.from.userId === lt.myUserId)
  const nickname = msg.from?.nickname || '匿名'
  /* 随机化速度和字号 —— B 站风格的快慢混合 + 大小不一,叠加用户设置的缩放
   * speed 越大 → duration 越小 → 飘得越快;fontScale 直接乘到 base 字号上 */
  const speed = ltSettings.danmakuSpeed || 1
  const fontScale = ltSettings.danmakuFontScale || 1
  const duration = Math.round(randInRange(FLY_DURATION_MIN_MS, FLY_DURATION_MAX_MS) / speed)
  const baseFontSize = FONT_SIZES[Math.floor(Math.random() * FONT_SIZES.length)]
  const fontSize = Math.round(baseFontSize * fontScale)

  const item: DanmakuItem = {
    id: msg.id,
    text: msg.content.slice(0, 80), // 防超长
    avatar: msg.from?.avatar,
    nickname,
    isSelf,
    track: pickTrack(),
    duration,
    fontSize,
    startedAt: Date.now()
  }
  flying.value.push(item)

  /* 飞完后自动从 list 移除 —— 加 500ms 缓冲避免动画结束瞬间 reactivity race */
  const timer = setTimeout(() => {
    cleanupTimers.delete(timer)
    flying.value = flying.value.filter((d) => d.id !== item.id)
  }, duration + 500)
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

const visible = computed(() => lt.isInRoom && ltSettings.enableDanmaku)

/* 用户在房间内关闭"开启弹幕"时,清掉所有飞行中的弹幕,
 * 否则会停留在屏幕上等动画跑完(看起来像没生效)。 */
watch(
  () => ltSettings.enableDanmaku,
  (enabled) => {
    if (!enabled) {
      flying.value = []
      cleanupTimers.forEach(clearTimeout)
      cleanupTimers.clear()
    }
  }
)

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
        top: `calc(${(d.track / TRACK_COUNT) * 100}% + 4px)`,
        animationDuration: `${d.duration}ms`,
        fontSize: `${d.fontSize}px`
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
/* 弹幕区只覆盖歌词大致所在的"上半屏中部":
 *  - top: 顶部操作栏 + 一点缓冲(预留给按钮),约 80px
 *  - bottom: 50%(播放器一半,即垂直方向中点)
 * 这样弹幕飘过的范围与歌词重叠但不挡播放控制 */
.lt-danmaku-layer {
  position: absolute;
  top: 80px;
  left: 0;
  right: 0;
  bottom: 50%;
  pointer-events: none;
  overflow: hidden;
  z-index: 5;
}

.lt-danmaku-item {
  position: absolute;
  left: 100%;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  /* 半透明 + 弱阴影,尽量不挡背景视野;字色偏淡也保持可读 */
  background: rgba(0, 0, 0, 0.28);
  color: rgba(255, 255, 255, 0.82);
  line-height: 1.2;
  white-space: nowrap;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  animation-name: lt-danmaku-fly;
  animation-timing-function: linear;
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
  max-width: 60%;
  text-overflow: ellipsis;
  overflow: hidden;
}

.lt-danmaku-item.self {
  /* 自己的弹幕用主题色但同样保持低不透明度 */
  background: rgba(64, 158, 255, 0.38);
  color: rgba(255, 255, 255, 0.95);
}

.lt-danmaku-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  opacity: 0.85;
}

.lt-danmaku-name {
  font-weight: 500;
  opacity: 0.78;
}

.lt-danmaku-sep {
  opacity: 0.5;
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
