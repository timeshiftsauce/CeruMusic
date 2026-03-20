import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue'

export function useActivationState() {
  const isActive = ref(false)

  onMounted(() => {
    isActive.value = true
  })

  onActivated(() => {
    isActive.value = true
  })

  onDeactivated(() => {
    isActive.value = false
  })

  onUnmounted(() => {
    isActive.value = false
  })

  return isActive
}
