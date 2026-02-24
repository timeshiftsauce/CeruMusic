<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

const duration = 3
const running = ref(false)
const progress = ref(0)
const results = ref<Array<{ id: string; name: string; album: string; startSec: number }>>([])

let audioCtx: AudioContext | null = null
let recorderNode: AudioWorkletNode | null = null
let audioNode: MediaElementAudioSourceNode | null = null

function reset() {
  running.value = false
  progress.value = 0
}

async function init() {
  if (audioCtx) return true
  audioCtx = new AudioContext({ sampleRate: 8000 })
  if (audioCtx.state === 'suspended') return false
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
      reset()
    } else if (data.message === 'bufferhealth') {
      progress.value = Math.max(0, Math.min(1, data.health || 0))
    }
  }
  return true
}

async function start() {
  results.value = []
  if (!(await init())) {
    MessagePlugin.warning('音频上下文未能初始化')
    return
  }
  try {
    recorderNode?.port.postMessage({ message: 'start', duration })
    running.value = true
  } catch (e: any) {
    running.value = false
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
  } catch (e: any) {
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
    } catch (e: any) {
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
}

onMounted(() => {})
</script>

<template>
  <div class="audio-match">
    <t-button size="small" variant="text" :disabled="running" @click.stop="start">
      {{ running ? `${(duration * (1 - progress)).toFixed(2)}s` : '识曲' }}
    </t-button>
    <div v-if="results.length" class="match-results">
      <a
        v-for="r in results"
        :key="r.id + r.startSec"
        :href="`https://music.163.com/song?id=${r.id}`"
        target="_blank"
        rel="noreferrer"
      >
        {{ r.name }} - {{ r.album }} ({{ r.startSec }}s)
      </a>
    </div>
  </div>
</template>

<style scoped>
.audio-match {
  display: inline-flex;
  align-items: center;
}
.match-results {
  display: flex;
  gap: 8px;
  margin-left: 6px;
  max-width: 360px;
  overflow: auto;
}
.match-results a {
  color: var(--td-brand-color-5);
  white-space: nowrap;
}
</style>
