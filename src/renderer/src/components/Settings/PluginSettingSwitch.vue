<template>
  <div class="switch-row">
    <div>
      <span :id="id">{{ label }}</span>
      <p :id="id + '-description'">{{ description }}</p>
    </div>
    <button
      type="button"
      role="switch"
      :aria-label="accessibleLabel || label"
      :aria-describedby="id + '-description'"
      :aria-checked="checked"
      :disabled="disabled"
      @click="$emit('change', !checked)"
    >
      <span aria-hidden="true" />
    </button>
  </div>
</template>
<script setup lang="ts">
defineProps<{
  id: string
  label: string
  accessibleLabel?: string
  description: string
  checked: boolean
  disabled?: boolean
}>()
defineEmits<{ change: [value: boolean] }>()
</script>
<style scoped>
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 9px 0;
  font-size: 14px;
  line-height: 20px;
}
.switch-row p {
  margin: 3px 0 0;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}
button {
  flex: none;
  position: relative;
  border: none;
  border-radius: 999px;
  width: 34px;
  height: 20px;
  padding: 0;
  background: var(--td-text-color-placeholder);
  cursor: pointer;
}
button span {
  position: absolute;
  left: 3px;
  top: 3px;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
}
button[aria-checked='true'] {
  background: var(--td-brand-color);
}
button[aria-checked='true'] span {
  transform: translateX(14px);
}
button:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 3px;
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
