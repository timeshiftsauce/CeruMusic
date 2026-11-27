<script setup lang="ts">
import { useId } from 'vue'
import {
  DEFAULT_ANALYSIS_SECONDS,
  MAX_ANALYSIS_SECONDS,
  MIN_ANALYSIS_SECONDS
} from '@common/automix'
import { playSetting as usePlaySetting } from '@renderer/store/playSetting'

const settings = usePlaySetting()
const inputId = useId()

function changeAnalysisTime(event: Event) {
  const input = event.target as HTMLInputElement
  const seconds = input.valueAsNumber
  if (Number.isFinite(seconds)) settings.setAutomixMaxAnalyzeTime(seconds)
  input.value = String(settings.getAutomixMaxAnalyzeTime)
}
</script>

<template>
  <div class="automix-row">
    <span>自动混音（无感过渡）</span>
    <t-switch
      aria-label="启用自动混音（无感过渡）"
      :value="settings.getIsSeamlessTransition"
      @update:value="settings.setIsSeamlessTransition"
    />
  </div>
  <div v-if="settings.getIsSeamlessTransition" class="automix-detail">
    <div class="automix-row">
      <label :for="inputId">最大分析时间</label>
      <div class="analysis-time">
        <input
          :id="inputId"
          type="number"
          inputmode="numeric"
          :value="settings.getAutomixMaxAnalyzeTime"
          :min="MIN_ANALYSIS_SECONDS"
          :max="MAX_ANALYSIS_SECONDS"
          :aria-describedby="`${inputId}-hint`"
          @change="changeAnalysisTime"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <span aria-hidden="true">秒</span>
      </div>
    </div>
    <small :id="`${inputId}-hint`" class="analysis-hint">
      每首歌 {{ MIN_ANALYSIS_SECONDS }}–{{ MAX_ANALYSIS_SECONDS }} 秒，建议
      {{ DEFAULT_ANALYSIS_SECONDS }} 秒
    </small>
  </div>
</template>

<style scoped>
.automix-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  font-size: 13px;
  line-height: 1.5;
}

.automix-detail {
  padding: 2px 0 7px;
}

.analysis-hint {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.7;
}

.analysis-time {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, currentColor 6%, transparent);
}

.analysis-time:focus-within {
  outline: 2px solid var(--skin-tint, var(--td-brand-color));
  outline-offset: 1px;
}

.analysis-time input {
  appearance: textfield;
  width: 3ch;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.analysis-time input::-webkit-inner-spin-button,
.analysis-time input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}

.analysis-time > span {
  font-size: 12px;
  opacity: 0.7;
}
</style>
