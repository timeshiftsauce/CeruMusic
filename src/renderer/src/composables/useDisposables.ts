import { onUnmounted } from 'vue'
import { createDisposableBag } from '@renderer/utils/disposables'

export function useDisposables() {
  const bag = createDisposableBag()

  onUnmounted(() => {
    bag.flush()
  })

  return bag
}
