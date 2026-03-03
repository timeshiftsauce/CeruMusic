<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

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

async function processFile(id: string, filePath: string) {
  try {
    await ensureAFP()
    
    // Read file via exposed API
    // Note: We need to use arrayBuffer.
    // The exposed api.file.readFile returns Buffer (Uint8Array) which is compatible.
    const buffer = await (window as any).api.file.readFile(filePath)
    if (!buffer) throw new Error('File read failed')

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    try {
      // decodeAudioData requires ArrayBuffer, Buffer is Uint8Array which is ArrayBufferView.
      // We need buffer.buffer but careful with offset.
      // Electron's buffer is a Node Buffer, which is a Uint8Array.
      // We can copy it to ArrayBuffer if needed.
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset, 
        buffer.byteOffset + buffer.byteLength
      )
      
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      
      // Resample
      const pcm8k = await resampleTo8kMono(audioBuffer)

      // Take up to 15s (same as recognize.vue logic)
      const MAX_DURATION = 15
      const targetLength = MAX_DURATION * 8000
      const slice = new Float32Array(Math.min(pcm8k.length, targetLength))
      slice.set(pcm8k.subarray(0, slice.length))

      const gen = (window as any).GenerateFP
      if (typeof gen === 'function') {
        const fp = await gen(slice)
        // Send back result
        ;(window as any).electron.ipcRenderer.send('worker:fp-generated', {
          id,
          fp,
          duration: slice.length / 8000,
          originalDuration: audioBuffer.duration
        })
      } else {
        throw new Error('AFP library not loaded')
      }
    } finally {
      ctx.close()
    }
  } catch (e: any) {
    console.error('Worker processing failed:', e)
    ;(window as any).electron.ipcRenderer.send('worker:fp-error', {
      id,
      error: e?.message || 'Unknown error'
    })
  }
}

onMounted(() => {
  console.log('Recognition Worker Mounted')
  ;(window as any).electron.ipcRenderer.on('worker:start-task', (_e, { id, filePath }) => {
    console.log('Worker received task:', id, filePath)
    processFile(id, filePath)
  })
  // Notify main process that worker is ready
  ;(window as any).electron.ipcRenderer.send('worker:ready')
})

onUnmounted(() => {
  ;(window as any).electron.ipcRenderer.removeAllListeners('worker:start-task')
})
</script>

<template>
  <div style="padding: 20px; color: white;">
    <h1>Recognition Worker</h1>
    <p>This window processes audio fingerprinting in background.</p>
  </div>
</template>
