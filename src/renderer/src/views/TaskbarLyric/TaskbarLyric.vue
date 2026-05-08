<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

interface LyricWord {
  word: string
  startTime: number
  endTime: number
}
interface LyricLine {
  startTime: number
  endTime: number
  words: LyricWord[]
}

const ipc: any = (window as any)?.electron?.ipcRenderer

// 当前播放数据
const songName = ref('')
const artist = ref('')
const cover = ref('')
const lines = ref<LyricLine[]>([])
const currentIndex = ref(-1)
const lineProgress = ref(0)
const currentMs = ref(0)
const isPlaying = ref(false)

// 配置
const fontSize = ref(14)
const mainColor = ref('#73BCFC')
const unplayedColor = ref('rgba(255,255,255,0.55)')
const showCover = ref(true)

// hover 时显示控件
const isHovered = ref(false)

// 当前行
const currentLine = computed(() => {
  const i = currentIndex.value
  if (i < 0 || i >= lines.value.length) return null
  return lines.value[i]
})

// 是否逐字（YRC）
const isKaraoke = computed(() => {
  const line = currentLine.value
  return !!line && Array.isArray(line.words) && line.words.length > 1
})

// 整行渐变（LRC 退化）
const lineFillStyle = computed(() => {
  const pct = Math.round(Math.min(1, Math.max(0, lineProgress.value)) * 100)
  return {
    background: `linear-gradient(to right, ${mainColor.value} ${pct}%, ${unplayedColor.value} ${pct}%)`,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent'
  } as Record<string, string>
})

// 单字进度（0-1）
function wordProgress(word: LyricWord): number {
  const t = currentMs.value
  if (t < word.startTime) return 0
  if (t >= word.endTime) return 1
  const dur = Math.max(1, word.endTime - word.startTime)
  return (t - word.startTime) / dur
}

function wordStyle(word: LyricWord): Record<string, string> {
  const pct = Math.round(wordProgress(word) * 100)
  return {
    background: `linear-gradient(to right, ${mainColor.value} ${pct}%, ${unplayedColor.value} ${pct}%)`,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent'
  }
}

// IPC 订阅
const handlers: Array<{ ch: string; fn: (...args: any[]) => void }> = []
function on(ch: string, fn: (...args: any[]) => void) {
  ipc?.on?.(ch, fn)
  handlers.push({ ch, fn })
}

onMounted(async () => {
  // 初始化配置
  try {
    const cfg = await (window as any).api?.taskbarLyric?.getConfig?.()
    if (cfg) applyConfig(cfg)
  } catch {}

  on('play-song-change', (_e: any, payload: any) => {
    if (!payload) return
    if (typeof payload === 'string') {
      // 旧版只传 string
      const parts = payload.split(' - ')
      songName.value = parts[0] || ''
      artist.value = parts[1] || ''
    } else {
      songName.value = payload.name || ''
      artist.value = payload.artist || ''
      if (typeof payload.cover === 'string') cover.value = payload.cover
    }
  })
  on('play-lyric-change', (_e: any, data: LyricLine[]) => {
    lines.value = Array.isArray(data) ? data : []
    currentIndex.value = -1
    lineProgress.value = 0
  })
  on('play-lyric-index', (_e: any, idx: number) => {
    currentIndex.value = typeof idx === 'number' ? idx : -1
  })
  on('play-lyric-progress', (_e: any, payload: any) => {
    if (!payload) return
    if (typeof payload.index === 'number') currentIndex.value = payload.index
    if (typeof payload.progress === 'number') lineProgress.value = payload.progress
    if (typeof payload.currentMs === 'number') currentMs.value = payload.currentMs
  })
  on('play-status-change', (_e: any, status: boolean) => {
    isPlaying.value = !!status
  })
  on('taskbar-lyric-config-change', (_e: any, cfg: any) => {
    if (cfg) applyConfig(cfg)
  })

  // 通知主进程渲染端就绪，请求快照
  ;(window as any).api?.taskbarLyric?.ready?.()
})

function applyConfig(cfg: any) {
  if (typeof cfg.fontSize === 'number') fontSize.value = cfg.fontSize
  if (typeof cfg.mainColor === 'string') mainColor.value = cfg.mainColor
  if (typeof cfg.unplayedColor === 'string') unplayedColor.value = cfg.unplayedColor
  if (typeof cfg.showCover === 'boolean') showCover.value = cfg.showCover
}

onBeforeUnmount(() => {
  for (const h of handlers) ipc?.removeListener?.(h.ch, h.fn)
  handlers.length = 0
})

function handleEnter() {
  isHovered.value = true
  ;(window as any).api?.taskbarLyric?.setMousePassthrough?.(false)
}
function handleLeave() {
  isHovered.value = false
  ;(window as any).api?.taskbarLyric?.setMousePassthrough?.(true)
}
function handleClose() {
  ;(window as any).api?.taskbarLyric?.toggle?.(false)
}
</script>

<template>
  <div class="taskbar-lyric" @mouseenter="handleEnter" @mouseleave="handleLeave">
    <div class="content">
      <div v-if="showCover && cover" class="cover">
        <img :src="cover" alt="cover" />
      </div>
      <div class="info">
        <div class="song-name" :title="songName">{{ songName || '澜音' }}</div>
        <div class="artist" :title="artist">{{ artist }}</div>
      </div>
      <div class="lyric" :style="{ fontSize: fontSize + 'px' }">
        <template v-if="currentLine">
          <template v-if="isKaraoke">
            <span
              v-for="(w, i) in currentLine.words"
              :key="i"
              class="word"
              :style="wordStyle(w)"
            >{{ w.word }}</span>
          </template>
          <span v-else class="line" :style="lineFillStyle">
            {{ currentLine.words.map((w) => w.word).join('') }}
          </span>
        </template>
        <span v-else class="placeholder">{{ isPlaying ? '...' : '暂无歌词' }}</span>
      </div>
      <button v-if="isHovered" class="close-btn" @click="handleClose" title="关闭任务栏歌词">
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.taskbar-lyric {
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0);
  display: flex;
  align-items: center;
  font-family:
    PingFangSC-Semibold, 'Microsoft YaHei', 'Segoe UI', sans-serif;
  -webkit-app-region: no-drag;
  user-select: none;
  overflow: hidden;
}

.content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 6px;
  position: relative;
}

.cover {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.info {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 130px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.15;
}
.song-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lyric {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  letter-spacing: 0.2px;
  display: flex;
  align-items: center;
  gap: 0;
}
.lyric .word {
  display: inline-block;
  white-space: pre;
}
.lyric .line {
  display: inline-block;
}
.lyric .placeholder {
  color: rgba(255, 255, 255, 0.45);
  font-weight: 400;
  font-size: 12px;
}

.close-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.close-btn:hover {
  background: rgba(255, 80, 80, 0.7);
}
</style>
