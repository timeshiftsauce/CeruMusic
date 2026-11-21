<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Button } from 'tdesign-vue-next'
import { useAction, useHostComponents, useViewState } from '@shiqianjiang/ceru-plugin-sdk/vue'

const { PageHeader } = useHostComponents()
const state = useViewState<{ count?: number }>()
const count = computed(() => state.value.count ?? 0)
const read = useAction('counter.read')
const increment = useAction('counter.increment')
const busy = ref(false)
const error = ref('')

async function run(action: typeof read) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

onMounted(() => { void run(read) })
</script>

<template>
  <section class="counter">
    <PageHeader title="练习计数器" description="次数保存在当前插件的存储中。" />
    <p aria-live="polite">当前次数：{{ count }}</p>
    <Button :loading="busy" :disabled="busy" @click="run(increment)">加一</Button>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.counter {
  padding: 20px;
  color: var(--td-text-color-primary);
}
.counter [role='alert'] {
  color: var(--td-error-color);
}
</style>
