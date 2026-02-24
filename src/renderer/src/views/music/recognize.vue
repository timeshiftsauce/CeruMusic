<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  MicrophoneIcon,
  StopCircleIcon,
  UploadIcon,
  PlayCircleIcon,
  SearchIcon,
  RefreshIcon,
  PlayIcon
} from 'tdesign-icons-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { playSong } from '@renderer/utils/audio/globaPlayList'
import { searchValue } from '@renderer/store/search'
import { useRouter } from 'vue-router'

const audioStore = ControlAudioStore()
const localUserStore = LocalUserDetailStore()
const searchStore = searchValue()
const router = useRouter()

const MAX_DURATION = 15
const SLICE_DURATION = 3000 // 3s

const running = ref(false)
const status = ref('') // 'recording' | 'processing' | 'uploading' | 'success' | 'failed'
const currentDuration = ref(0)
const recognizedSongs = ref<any[]>([])
const wasPlaying = ref(false)

let recorder: MediaRecorder | null = null
let chunks: Blob[] = []
let stream: MediaStream | null = null
let timer: any = null

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = (e) => reject(e)
    document.head.appendChild(s)
  })
}

async function ensureAFP() {
  const g = window as any
  if (typeof g.GenerateFP === 'function') return
  if (!g.__afp_wasm_loaded__) {
    try {
      await loadScript('afp.wasm.js')
      g.__afp_wasm_loaded__ = true
    } catch {}
  }
  if (!g.__afp_runtime_loaded__) {
    try {
      await loadScript('afp.js')
      g.__afp_runtime_loaded__ = true
    } catch {}
  }
}

async function resampleTo8kMono(audioBuffer: AudioBuffer): Promise<Float32Array> {
  const ctx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
    1,
    Math.floor(audioBuffer.duration * 8000),
    8000
  )

  const source = ctx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(ctx.destination)
  source.start()

  const renderedBuffer = await ctx.startRendering()
  return renderedBuffer.getChannelData(0)
}

async function start() {
  if (running.value) return

  try {
    status.value = 'initializing'
    await ensureAFP()

    // Pause music if playing
    if (audioStore.Audio.isPlay) {
      wasPlaying.value = true
      await audioStore.stop()
    } else {
      wasPlaying.value = false
    }

    // Get system audio stream
    const sourceId = await (window as any).api?.systemAudio?.getDefaultScreenSourceId?.()
    if (!sourceId) {
      MessagePlugin.error('无法获取屏幕源ID')
      reset()
      return
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          googEchoCancellation: false,
          googNoiseSuppression: false,
          googAutoGainControl: false,
          googHighpassFilter: false
        }
      } as any,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      } as any
    })

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const audioStream = new MediaStream(stream.getAudioTracks())
    recorder = new MediaRecorder(audioStream, { mimeType })

    chunks = []
    running.value = true
    status.value = 'recording'
    currentDuration.value = 0
    recognizedSongs.value = []

    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data)

        // Try recognition with accumulated data
        const blob = new Blob(chunks, { type: mimeType })
        await tryRecognize(blob)
      }
    }

    // Start recording with time slices
    recorder.start(SLICE_DURATION)

    // Timer for UI update and max duration check
    const startTime = Date.now()
    timer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000
      currentDuration.value = Math.floor(elapsed)

      if (elapsed >= MAX_DURATION) {
        stopRecording(false) // Stop without success (timeout)
      }
    }, 1000)
  } catch (err) {
    console.error('启动录音失败', err)
    MessagePlugin.error('启动录音失败，请检查权限')
    reset()
  }
}

async function tryRecognize(blob: Blob) {
  if (!running.value) return

  try {
    const arrayBuffer = await blob.arrayBuffer()
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

      // Basic silence check
      const channelData = audioBuffer.getChannelData(0)
      let hasSound = false
      for (let i = 0; i < channelData.length; i += 100) {
        if (Math.abs(channelData[i]) > 0.01) {
          hasSound = true
          break
        }
      }

      if (!hasSound) {
        console.warn('Silent audio detected')
        return
      }

      const pcm8k = await resampleTo8kMono(audioBuffer)

      const gen = (window as any).GenerateFP
      if (typeof gen === 'function') {
        const fp = await gen(pcm8k)
        console.log('[AudioRecognize] Generated FP length:', fp.length)

        const result = await window.api.music.requestSdk('recognize', {
          source: 'wy',
          fp,
          duration: audioBuffer.duration
        })
        console.log('[AudioRecognize] Recognition result:', result)
        if (result && result.length > 0) {
          recognizedSongs.value = result
          status.value = 'success'
          stopRecording(true)
        }
      }
    } finally {
      ctx.close()
    }
  } catch (e) {
    console.error('Recognition attempt failed', e)
  }
}

async function stopRecording(success: boolean = false) {
  if (!running.value) return

  if (recorder && recorder.state !== 'inactive') {
    recorder.stop()
  }

  if (timer) {
    clearInterval(timer)
    timer = null
  }

  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }

  running.value = false

  if (!success) {
    status.value = 'failed'
  }

  // Resume music if it was playing and we didn't just find a new song (optional)
  // Requirement: "Resume playback after recording finishes"
  if (wasPlaying.value) {
    setTimeout(() => {
      audioStore.start()
    }, 500)
    wasPlaying.value = false
  }
}

// File Upload Logic
const fileInput = ref<HTMLInputElement | null>(null)

function triggerUpload() {
  fileInput.value?.click()
}

async function onFilePicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (running.value) return

  status.value = 'processing'
  running.value = true
  recognizedSongs.value = []

  try {
    await ensureAFP()
    const arrayBuffer = await file.arrayBuffer()
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      const pcm8k = await resampleTo8kMono(audioBuffer)

      // Take up to 15s of the file
      const targetLength = MAX_DURATION * 8000
      const slice = new Float32Array(Math.min(pcm8k.length, targetLength))
      slice.set(pcm8k.subarray(0, slice.length))

      const gen = (window as any).GenerateFP
      if (typeof gen === 'function') {
        const fp = await gen(slice)
        const result = await window.api.music.requestSdk('recognize', {
          source: 'wy',
          fp,
          duration: slice.length / 8000
        })
        if (result && result.length > 0) {
          recognizedSongs.value = result
          status.value = 'success'
        } else {
          status.value = 'failed'
          MessagePlugin.warning('未识别到歌曲')
        }
      }
    } finally {
      ctx.close()
    }
  } catch (e) {
    console.error('File recognition failed', e)
    status.value = 'failed'
    MessagePlugin.error('识别失败')
  } finally {
    running.value = false
  }
}

function reset() {
  running.value = false
  status.value = ''
  currentDuration.value = 0
  chunks = []
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function backToInitial() {
  reset()
  recognizedSongs.value = []
}

async function handlePlayResult(song: any) {
  if (!song) return
  localUserStore.addSongToFirst(song)
  await playSong(song)

  // Jump to recognized progress
  if (song.startTime && song.startTime > 0) {
    // startTime is usually in ms
    const seconds = song.startTime / 1000
    // Wait a bit for player to be ready or just set it
    // The player might need time to load.
    // playSong is async and waits for start(), but buffering might take time.
    // However, setCurrentTime in store just sets the state, which should be fine if audio element is present.
    setTimeout(() => {
      audioStore.setCurrentTime(seconds)
      if (audioStore.Audio.audio) {
        audioStore.Audio.audio.currentTime = seconds
      }
      MessagePlugin.success(`已跳转至识别片段: ${formatTime(seconds)}`)
    }, 500)
  }
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function handleSearchResult(song: any) {
  if (!song) return
  searchStore.setValue(song.name)
  router.push({ name: 'search' })
}

onUnmounted(() => {
  reset()
})
</script>

<template>
  <div class="recognize-page">
    <div class="recognize-container">
      <div class="header">
        <h2>听歌识曲</h2>
        <p class="subtitle">识别电脑正在播放的声音或上传音频文件</p>
      </div>

      <div v-if="!recognizedSongs.length || running" class="visualizer-section">
        <div class="circle-waves" :class="{ 'is-active': running }">
          <div class="wave"></div>
          <div class="wave"></div>
          <div class="wave"></div>
          <div class="icon-container">
            <MicrophoneIcon size="48px" />
          </div>
        </div>
      </div>

      <div class="status-display">
        <template v-if="running">
          <p class="status-text">正在识别中... {{ currentDuration }}s / {{ MAX_DURATION }}s</p>
          <t-progress
            :percentage="(currentDuration / MAX_DURATION) * 100"
            size="small"
            :label="false"
          />
        </template>
        <template v-else-if="recognizedSongs.length > 0">
          <div class="result-list">
            <div v-for="song in recognizedSongs" :key="song.songmid" class="result-item">
              <div class="result-cover-wrapper">
                <img :src="song.img" class="result-cover" />
              </div>
              <div class="result-content">
                <h3>{{ song.name }}</h3>
                <p>{{ song.singer }}</p>
                <div v-if="song.startTime > 0" class="result-meta">
                  <span>识别片段: {{ formatTime(song.startTime / 1000) }}</span>
                </div>
              </div>
              <div class="result-actions">
                <t-button theme="primary" shape="circle" @click="handlePlayResult(song)">
                  <template #icon><PlayCircleIcon /></template>
                </t-button>
                <t-button
                  theme="default"
                  variant="outline"
                  shape="circle"
                  @click="handleSearchResult(song)"
                >
                  <template #icon><SearchIcon /></template>
                </t-button>
              </div>
            </div>
          </div>
          <div class="result-footer">
            <t-button theme="primary" variant="text" @click="backToInitial">
              <template #icon><RefreshIcon /></template>
              继续识别
            </t-button>
          </div>
        </template>
        <template v-else-if="status === 'failed'">
          <p class="status-text error">未能识别到歌曲</p>
          <t-button theme="default" variant="text" @click="start">重试</t-button>
        </template>
        <template v-else>
          <p class="status-text">点击下方按钮开始</p>
        </template>
      </div>

      <div v-if="recognizedSongs.length === 0" class="actions">
        <t-button
          shape="circle"
          size="large"
          theme="primary"
          class="main-btn"
          :loading="status === 'initializing' || status === 'processing'"
          @click="running ? stopRecording(false) : start()"
        >
          <template #icon>
            <StopCircleIcon v-if="running" size="36px" />
            <PlayIcon v-else size="36px" />
          </template>
        </t-button>

        <div class="sub-actions">
          <t-button variant="text" theme="default" :disabled="running" @click="triggerUpload">
            <template #icon><UploadIcon /></template>
            上传文件
          </t-button>
        </div>
        <input ref="fileInput" type="file" accept="audio/*" hidden @change="onFilePicked" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.recognize-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* background: var(--td-bg-color-container); */
  border-radius: 8px;
  overflow: hidden;
}

.recognize-container {
  width: 100%;
  height: 100%;
  padding: 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 24px;
  transition: all 0.3s ease;
  overflow: hidden;
  align-items: center;
}

.header h2 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--td-text-color-primary);
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 14px;
  color: var(--td-text-color-secondary);
}

.visualizer-section {
  display: flex;
  justify-content: center;
  padding: 10px 0;
  flex-shrink: 0;
}

.circle-waves {
  position: relative;
  width: 140px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-container {
  z-index: 10;
  width: 90px;
  height: 90px;
  background: var(--td-brand-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  overflow: hidden;
}

.is-active .icon-container {
  transform: scale(1.1);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.2);
}

.wave {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--td-brand-color);
  opacity: 0;
  z-index: 0;
}

.is-active .wave {
  animation: wave 2s infinite;
}

.is-active .wave:nth-child(2) {
  animation-delay: 0.6s;
}

.is-active .wave:nth-child(3) {
  animation-delay: 1.2s;
}

@keyframes wave {
  0% {
    width: 100%;
    height: 100%;
    opacity: 0.4;
  }
  100% {
    width: 250%;
    height: 250%;
    opacity: 0;
  }
}

.status-display {
  width: 100%;
  max-width: 600px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
  padding: 0 4px; /* Add some padding for scrollbar */
}

.status-display::-webkit-scrollbar {
  width: 6px;
}

.status-display::-webkit-scrollbar-thumb {
  background-color: var(--td-scrollbar-color);
  border-radius: 3px;
}

.status-display::-webkit-scrollbar-track {
  background: transparent;
}

.status-text {
  font-size: 15px;
  color: var(--td-text-color-secondary);
}

.status-text.error {
  color: var(--td-error-color);
}

/* Result List Styles */
.result-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: slideUp 0.5s ease-out;
}

.result-item {
  display: flex;
  align-items: center;
  background: var(--td-bg-color-secondary);
  padding: 12px;
  border-radius: 12px;
  gap: 16px;
  transition: all 0.2s ease;
}

.result-item:hover {
  background: var(--td-bg-color-component-hover);
  transform: translateY(-2px);
}

.result-cover-wrapper {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.result-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.result-content {
  flex: 1;
  text-align: left;
  min-width: 0; /* Prevent text overflow issues */
}

.result-content h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-content p {
  font-size: 14px;
  color: var(--td-text-color-secondary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
}

.result-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-top: auto; /* Push to bottom if space permits */
  padding-bottom: 20px;
}

.main-btn {
  width: 72px;
  height: 72px;
  font-size: 36px;
  transition: transform 0.2s;
}

.main-btn:active {
  transform: scale(0.95);
}

.sub-actions {
  display: flex;
  gap: 16px;
}

.result-footer {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
</style>
