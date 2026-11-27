<script setup lang="ts">
import { ChevronDownIcon, ChevronUpIcon } from 'tdesign-icons-vue-next'

const props = defineProps<{
  items: { id: string; label: string; detail?: string; enabled?: boolean }[]
  disabled?: boolean
}>()
const emit = defineEmits<{
  reorder: [ids: string[]]
  toggle: [id: string, enabled: boolean]
}>()

function move(index: number, offset: number) {
  const ids = props.items.map(({ id }) => id)
  const destination = index + offset
  if (destination < 0 || destination >= ids.length) return
  const [id] = ids.splice(index, 1)
  ids.splice(destination, 0, id)
  emit('reorder', ids)
}
</script>

<template>
  <TransitionGroup tag="ul" name="fallback-order" class="order-list">
    <li v-for="(item, index) in items" :key="item.id" class="order-row">
      <div class="order-label" :class="{ inactive: item.enabled === false }">
        <span>{{ item.label }}</span>
        <small v-if="item.detail">{{ item.detail }}</small>
      </div>
      <n-switch
        v-if="item.enabled !== undefined"
        size="small"
        :value="item.enabled"
        :aria-label="item.label"
        @update:value="emit('toggle', item.id, Boolean($event))"
      />
      <div class="order-buttons">
        <t-button
          theme="default"
          variant="text"
          size="small"
          :disabled="disabled || index === 0"
          :aria-label="'上移' + item.label"
          @click="move(index, -1)"
        >
          <template #icon><ChevronUpIcon /></template>
        </t-button>
        <t-button
          theme="default"
          variant="text"
          size="small"
          :disabled="disabled || index === items.length - 1"
          :aria-label="'下移' + item.label"
          @click="move(index, 1)"
        >
          <template #icon><ChevronDownIcon /></template>
        </t-button>
      </div>
    </li>
  </TransitionGroup>
</template>

<style scoped>
.order-list {
  display: grid;
  gap: 0;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.order-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 39px;
  padding: 5px 2px;
  border-top: 1px solid var(--td-component-stroke);
  font-size: 13px;
}
.order-label {
  display: grid;
  gap: 1px;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.order-label.inactive,
small {
  color: var(--td-text-color-secondary);
}
.order-buttons {
  display: flex;
}
.fallback-order-move {
  transition: transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1);
}
@media (prefers-reduced-motion: reduce) {
  .fallback-order-move {
    transition: none;
  }
}
</style>
