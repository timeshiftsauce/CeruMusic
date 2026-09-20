<script setup lang="ts">
import { PlayCircleIcon } from 'tdesign-icons-vue-next'
import { useSettingsStore } from '@renderer/store/Settings'
defineProps<{
  items: {
    id: string | number
    title: string
    cover?: string
    description?: string
    total?: string | number
    playCount?: string | number
    source?: string
  }[]
  showSource?: boolean
  disabled?: boolean
}>()
defineEmits<{ open: [index: number] }>()
const settings = useSettingsStore()
</script>
<template>
  <div class="playlist-grid">
    <article
      v-for="(item, index) in items"
      :key="item.id"
      class="playlist-card"
      :class="{ 'custom-bg': settings.settings.globalBackground?.enable }"
      :style="{ '--cover-url': `url('${item.cover || ''}')` }"
    >
      <button class="playlist-open" :disabled="disabled" @click="$emit('open', index)">
        <div class="playlist-cover">
          <s-image :src="item.cover || ''" class="playlist-cover-image" />
          <span v-if="showSource && item.source" class="source-badge">{{ item.source }}</span>
          <div class="cover-overlay"><PlayCircleIcon class="play-icon" /></div>
        </div>
        <div class="playlist-info">
          <h4 class="playlist-title">{{ item.title }}</h4>
          <p class="playlist-desc">{{ item.description }}</p>
          <div class="playlist-meta">
            <span class="play-count"><i class="iconfont icon-bofang"></i>{{ item.playCount }}</span>
            <span v-if="item.total" class="song-count">{{ item.total }}首</span>
          </div>
        </div>
      </button>
      <div v-if="$slots.actions" class="playlist-item-actions">
        <slot name="actions" :index="index" />
      </div>
    </article>
  </div>
</template>
<style scoped lang="scss">
@use './playlistGrid.scss';
.playlist-open {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.playlist-open:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: -3px;
}
.playlist-item-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
}
@media (prefers-reduced-motion: reduce) {
  .playlist-card,
  .playlist-cover-image,
  .playlist-info,
  .cover-overlay {
    transition: none;
  }
}
</style>
