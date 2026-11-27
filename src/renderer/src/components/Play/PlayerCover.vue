<script setup lang="ts">
import { ref, watch } from 'vue'
import defaultCover from '../../assets/images/song.jpg'

const props = defineProps<{ src?: string | null; alt?: string }>()
// Layout changes remount this component with the current cover already known.
const displayed = ref(props.src || defaultCover)

function useFallback(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (image.getAttribute('src') === displayed.value) displayed.value = defaultCover
}

watch(
  () => props.src,
  async (src, _previous, onCleanup) => {
    const next = src || defaultCover
    if (next === displayed.value) return

    let current = true
    onCleanup(() => {
      current = false
    })
    const image = new Image()
    image.src = next
    try {
      await image.decode()
      if (current) displayed.value = next
    } catch {
      if (current) displayed.value = defaultCover
    }
  }
)
</script>

<template>
  <div class="player-cover" :role="alt ? 'img' : undefined" :aria-label="alt">
    <Transition name="cover-fade">
      <img :key="displayed" :src="displayed" alt="" draggable="false" @error="useFallback" />
    </Transition>
  </div>
</template>

<style scoped>
.player-cover {
  --cover-fade-duration: 1s;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  isolation: isolate;
  user-select: none;
}

.player-cover img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-fade-enter-active {
  z-index: 1;
  transition: opacity var(--cover-fade-duration) ease-in-out;
}

.cover-fade-leave-active {
  transition: opacity calc(var(--cover-fade-duration) / 2) ease-out
    calc(var(--cover-fade-duration) / 2);
}

.cover-fade-enter-from,
.cover-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .cover-fade-enter-active,
  .cover-fade-leave-active {
    transition: none;
  }
}
</style>
