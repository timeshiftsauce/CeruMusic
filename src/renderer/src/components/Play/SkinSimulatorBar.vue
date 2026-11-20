<script setup lang="ts">
import { inject, ref } from 'vue'
import { skinSamples, skinSimulatorKey } from '@renderer/plugin/skinSimulator'
const simulator = inject(skinSimulatorKey)!
const { enabled, active, sample, theme, time, playing, frameMs } = simulator
const launch = ref<HTMLButtonElement>()
function close() { simulator.close(); launch.value?.focus() }
</script>
<template>
  <div v-if="enabled" class="skin-simulator" @keydown.esc.stop="close">
    <button ref="launch" type="button" aria-label="皮肤模拟器" title="皮肤模拟器" :aria-expanded="active" @click="active ? close() : active = true"><t-icon name="tools" /></button>
    <div v-if="active" class="sim-controls" role="group" aria-label="皮肤模拟器">
      <select v-model="sample" aria-label="测试曲目"><option v-for="(item, key) in skinSamples" :key="key" :value="key">{{ item.title }} · {{ item.label }}</option></select>
      <button type="button" :aria-label="playing ? '暂停预览' : '播放预览'" :title="playing ? '暂停预览' : '播放预览'" @click="simulator.togglePlay"><t-icon :name="playing ? 'pause' : 'play'" /></button>
      <input type="range" aria-label="预览时间轴" min="0" :max="simulator.durationMs" step="1" :value="Math.round(time)" @input="simulator.seek(($event.target as HTMLInputElement).valueAsNumber)" />
      <button type="button" aria-label="浅色预览" title="浅色预览" :aria-pressed="theme === 'light'" @click="theme = theme === 'light' ? 'dark' : 'light'"><t-icon :name="theme === 'light' ? 'sunny' : 'moon'" /></button>
      <output aria-label="平均帧间隔">{{ frameMs ? `${frameMs.toFixed(1)} ms` : '—' }}</output>
    </div>
  </div>
</template>
<style scoped>
.skin-simulator { position: absolute; top: 22px; left: 50%; transform: translateX(-50%); z-index: 6; display: flex; max-width: calc(100% - 270px); padding: 4px; border: 1px solid #595d5c; border-radius: 7px; background: #252728; color: #f7f8fa; -webkit-app-region: no-drag; }
.sim-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; min-width: 0; }
button, select { color: inherit; font: inherit; border: none; background: transparent; }
button { display: grid; place-items: center; flex: none; width: 30px; height: 30px; padding: 0; border-radius: 4px; cursor: pointer; }
button:hover, button[aria-pressed=true] { background: #444a47; }
select { min-width: 0; background: #343938; color-scheme: dark; }
input { width: clamp(52px, 10vw, 120px); accent-color: #94b6a7; }
output { width: 56px; font: 12px/1.5 monospace; text-align: center; }
</style>
