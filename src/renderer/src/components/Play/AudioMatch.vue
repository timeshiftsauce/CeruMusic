<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { UploadIcon, MicrophoneIcon } from 'tdesign-icons-vue-next'

const duration = 3
const isRecording = ref(false)
const progress = ref(0)
const results = ref<Array<{ id: string; name: string; album: string; startSec: number }>>([])
const isHovering = ref(false)
const showResults = ref(false)
const micPermissionDenied = ref(false)
const isProcessingFile = ref(false)

let audioCtx: AudioContext | null = null
let recorderNode: AudioWorkletNode | null = null
let audioNode: MediaElementAudioSourceNode | null = null
let micStream: MediaStream | null = null

function reset() {
  isRecording.value = false
  progress.value = 0
}

async function init() {
  if (audioCtx) return true
  audioCtx = new AudioContext({ sampleRate: 8000 })
  if (audioCtx.state === 'suspended') return false
  // 注意：当前 audio 元素 id 就是 "globaAudio"（拼写存在历史遗留，未修正）
  const audioEl = document.getElementById('globaAudio') as HTMLAudioElement | null
  if (!audioEl) return false
  audioNode = audioCtx.createMediaElementSource(audioEl)
  await audioCtx.audioWorklet.addModule('/rec.js')
  recorderNode = new AudioWorkletNode(audioCtx, 'timed-recorder')
  audioNode.connect(recorderNode)
  audioNode.connect(audioCtx.destination)
  recorderNode.port.onmessage = (event: MessageEvent<any>) => {
    const data = event.data
    if (!data) return
    if (data.message === 'finished') {
      generateAndQuery(data.recording)
      stopMicCapture()
      reset()
    } else if (data.message === 'bufferhealth') {
      progress.value = Math.max(0, Math.min(1, data.health || 0))
    }
  }
  return true
}

async function stopMicCapture() {
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop())
    micStream = null
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    await audioCtx.close()
    audioCtx = null
  }
}

async function start() {
  results.value = []
  showResults.value = false

  // 先请求麦克风权限（macOS 上需要）
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    micPermissionDenied.value = false
  } catch {
    micPermissionDenied.value = true
    MessagePlugin.warning({
      content: '麦克风权限被拒绝，请前往系统设置 > 隐私与安全性 > 麦克风 开启权限',
      duration: 5000
    })
    return
  }

  if (!(await init())) {
    MessagePlugin.warning('音频上下文未能初始化')
    return
  }
  try {
    recorderNode?.port.postMessage({ message: 'start', duration })
    isRecording.value = true
  } catch {
    isRecording.value = false
    stopMicCapture()
    MessagePlugin.error('录制启动失败')
  }
}

async function generateAndQuery(buffer: Float32Array) {
  try {
    const gen = (window as any).GenerateFP
    if (typeof gen !== 'function') {
      MessagePlugin.error('缺少指纹模块，请将 afp.wasm.js 与 afp.js 放入 public 并刷新')
      return
    }
    const fp: string = await gen(new Float32Array(buffer.subarray(0, duration * 8000)))
    await query(fp)
  } catch {
    MessagePlugin.error('指纹生成失败')
  }
}

async function query(fp: string) {
  const params = new URLSearchParams({
    sessionId: '0123456789abcdef',
    algorithmCode: 'shazam_v2',
    duration: String(duration),
    rawdata: fp,
    times: '1',
    decrypt: '1'
  })
  const url = `https://interface.music.163.com/api/music/audio/match?${params.toString()}`
  const tryFetch = async (target: string) => {
    const resp = await fetch(target, { method: 'POST' })
    return resp.json()
  }
  try {
    const body = await tryFetch(url)
    handleResult(body)
  } catch {
    try {
      const body = await tryFetch('https://cors-anywhere.herokuapp.com/' + url)
      handleResult(body)
    } catch {
      MessagePlugin.error('识曲请求失败')
    }
  }
}

function handleResult(resp: any) {
  const list = (resp?.data?.result || []) as any[]
  if (!Array.isArray(list) || list.length === 0) {
    MessagePlugin.warning('未匹配到结果')
    results.value = []
    return
  }
  results.value = list.map((song: any) => ({
    id: String(song?.song?.id || ''),
    name: String(song?.song?.name || ''),
    album: String(song?.song?.album?.name || ''),
    startSec: Math.round((song?.startTime || 0) / 1000)
  }))
  showResults.value = true
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  isProcessingFile.value = true
  MessagePlugin.info(`正在处理: ${file.name}...`)

  try {
    const arrayBuffer = await file.arrayBuffer()

    if (!audioCtx) {
      audioCtx = new AudioContext({ sampleRate: 8000 })
    }

    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

    // 提取前 duration 秒的音频数据
    const sampleRate = audioBuffer.sampleRate
    const channels = audioBuffer.numberOfChannels
    const length = Math.min(Math.floor(duration * 8000), audioBuffer.length)

    // 合并声道并降采样到 8kHz
    const float32Array = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      const srcIndex = Math.floor((i * sampleRate) / 8000)
      let sum = 0
      for (let c = 0; c < channels; c++) {
        sum += audioBuffer.getChannelData(c)[Math.min(srcIndex, audioBuffer.length - 1)]
      }
      float32Array[i] = sum / channels
    }

    await generateAndQuery(float32Array)
  } catch (e: any) {
    console.error('文件处理失败:', e)
    MessagePlugin.error(`文件处理失败: ${e.message || '不支持的音频格式'}`)
  } finally {
    isProcessingFile.value = false
    input.value = ''
  }
}

onMounted(() => {})
</script>

<template>
  <div
    class="audio-match-container"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
  >
    <!-- 鼠标悬停时显示的文字 -->
    <TransitionGroup name="fade-group" tag="div" class="label-group">
      <span v-if="isHovering" key="title" class="match-label">听歌识曲</span>
      <span v-if="isHovering" key="desc" class="match-desc"
        >识别电脑正在播放的声音或上传音频文件</span
      >
    </TransitionGroup>

    <!-- 主麦克风按钮 -->
    <button
      class="mic-btn"
      :class="{ recording: isRecording, 'file-processing': isProcessingFile }"
      :disabled="isRecording || isProcessingFile"
      @click.stop="start"
    >
      <span class="mic-btn-inner">
        <MicrophoneIcon size="28" />
      </span>
      <!-- 呼吸光环 -->
      <span v-if="isRecording" class="breathing-ring"></span>
      <span v-if="isRecording" class="breathing-ring delay"></span>
    </button>

    <!-- 上传文件按钮 -->
    <label class="upload-btn" :class="{ disabled: isRecording || isProcessingFile }">
      <UploadIcon size="18" />
      <input
        type="file"
        accept="audio/*"
        :disabled="isRecording || isProcessingFile"
        @change="handleFileUpload"
      />
    </label>

    <!-- 识别结果显示 -->
    <Transition name="slide-fade">
      <div v-if="showResults && results.length" class="match-results">
        <div class="results-header">识别结果</div>
        <a
          v-for="r in results"
          :key="r.id + r.startSec"
          :href="`https://music.163.com/song?id=${r.id}`"
          target="_blank"
          rel="noreferrer"
          class="result-item"
        >
          {{ r.name }} - {{ r.album }} ({{ r.startSec }}s)
        </a>
      </div>
    </Transition>

    <!-- 权限拒绝提示 -->
    <Transition name="fade">
      <div v-if="micPermissionDenied" class="permission-tip">请在系统设置中开启麦克风权限</div>
    </Transition>
  </div>
</template>

<style scoped>
.audio-match-container {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  position: relative;
  padding: 8px 12px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
}

.label-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-right: 8px;
}

.match-label {
  font-size: 12px;
  color: var(--td-brand-color-5);
  white-space: nowrap;
  font-weight: 500;
  line-height: 1.2;
}

.match-desc {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  line-height: 1.2;
}

.fade-group-enter-active,
.fade-group-leave-active {
  transition: all 0.25s ease;
}

.fade-group-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.fade-group-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.mic-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--td-brand-color-5) 0%, var(--td-brand-color-7) 100%);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 15px rgba(var(--td-brand-color-5), 0.3);
}

.mic-btn:hover:not(:disabled) {
  transform: scale(1.08);
  box-shadow: 0 6px 25px rgba(var(--td-brand-color-5), 0.5);
}

.mic-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.mic-btn:disabled {
  cursor: default;
  opacity: 0.7;
}

.mic-btn-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  position: relative;
}

.mic-btn.recording {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
  animation: none;
}

.breathing-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid rgba(255, 107, 107, 0.6);
  animation: breathing-pulse 1.5s ease-out infinite;
  pointer-events: none;
}

.breathing-ring.delay {
  animation-delay: 0.5s;
}

@keyframes breathing-pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.8;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.8);
    opacity: 0;
  }
}

.mic-btn.file-processing {
  background: linear-gradient(135deg, #a0a0a0 0%, #808080 100%);
}

.upload-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
  transition: all 0.2s ease;
}

.upload-btn:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  transform: scale(1.1);
}

.upload-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.upload-btn input {
  display: none;
}

.match-results {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  padding: 12px 16px;
  min-width: 200px;
  max-width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 1000;
}

.results-header {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.result-item {
  display: block;
  color: var(--td-brand-color-5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 6px 0;
  font-size: 13px;
  text-decoration: none;
  transition: color 0.2s ease;
}

.result-item:hover {
  color: var(--td-brand-color-7);
}

.result-item:not(:last-child) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.permission-tip {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  background: rgba(255, 107, 107, 0.9);
  color: white;
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 6px;
  white-space: nowrap;
  z-index: 1001;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
</style>
