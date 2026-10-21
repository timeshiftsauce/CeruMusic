<script setup lang="ts">
import { computed } from 'vue'
import { STICKER_MAP } from '@renderer/utils/listenTogether/stickers'
import ExpandableNoteText from './ExpandableNoteText.vue'

const props = defineProps<{ text: string }>()
const content = computed(() => {
  const stickers: { id: string; src: string; label: string }[] = []
  const text = props.text.replace(/\[(sticker-\d+)\]/g, (token, id: string) => {
    const sticker = STICKER_MAP[id]
    if (!sticker) return token
    stickers.push(sticker)
    return ''
  })
  return { stickers, text }
})
</script>

<template>
  <div class="comment-content">
    <ExpandableNoteText v-if="content.text.trim()" class="comment-text" :text="content.text" />
    <div v-if="content.stickers.length" class="comment-stickers" aria-label="评论贴纸">
      <img
        v-for="(sticker, index) in content.stickers"
        :key="index"
        class="comment-sticker-image"
        :src="sticker.src"
        :alt="sticker.label"
        :title="sticker.label"
        draggable="false"
      />
    </div>
  </div>
</template>

<style scoped>
.comment-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.comment-stickers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}
.comment-sticker-image {
  flex: 0 0 auto;
  width: 96px;
  max-width: 100%;
  height: auto;
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 8px;
}
.comment-text {
  line-height: 1.65;
  overflow-wrap: anywhere;
}
</style>
