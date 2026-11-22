<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { acquireSpectrum } from '@renderer/plugin/spectrum'
import SpectrumCanvas from './SpectrumCanvas.vue'

const props = withDefaults(defineProps<{ show?: boolean; height?: number; barCount?: number; color?: string; backgroundColor?: string }>(), { show: true })
const emit = defineEmits<{ lowFreqUpdate: [volume: number] }>()
const canvas = ref<InstanceType<typeof SpectrumCanvas>>()
const { Audio } = storeToRefs(ControlAudioStore())
watch(() => [Audio.value.audio, Audio.value.isPlay, props.show, canvas.value] as const, ([audio, playing, visible, view], _, cleanup) => {
  if (!audio || !playing || !visible || !view) return
  const spectrum = acquireSpectrum(audio)
  if (!spectrum) return
  spectrum.listen(bins => {
    view.draw(bins)
    emit('lowFreqUpdate', (bins[0] + bins[1] + bins[2]) / 3)
  })
  cleanup(() => spectrum.release())
}, { flush: 'post', immediate: true })
</script>

<template>
  <SpectrumCanvas ref="canvas" :height="height" :bar-count="barCount" :color="color" :background-color="backgroundColor" />
</template>
