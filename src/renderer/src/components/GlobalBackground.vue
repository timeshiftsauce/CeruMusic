<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSettingsStore } from '@renderer/store/Settings'
import { storeToRefs } from 'pinia'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const bgSettings = computed(() => settings.value.globalBackground)

const isEnabled = computed(() =>
  Boolean(bgSettings.value?.enable && bgSettings.value?.url && bgType.value !== 'none')
)
const bgType = computed(() => bgSettings.value?.type || 'none')
const bgUrl = computed(() => bgSettings.value?.url || '')
const bgOpacity = computed(() => bgSettings.value?.opacity ?? 0.5)
const bgBlur = computed(() => bgSettings.value?.blur ?? 10)
const bgBrightness = computed(() => bgSettings.value?.brightness ?? 0.8)

const videoRef = ref<HTMLVideoElement | null>(null)

// Include the template ref so restored video wallpapers start after the media element mounts.
watch(
  [videoRef, bgUrl, isEnabled],
  ([video, _url, enabled]) => {
    if (enabled && video) {
      video.load()
      video.play().catch((error) => {
        if (error.name !== 'AbortError') console.error('Video auto-play failed:', error)
      })
    }
  },
  { flush: 'post' }
)

// Theme changes only alter theme-mode/data-theme; keep wallpaper activation independent.
watch(
  isEnabled,
  (enabled) => document.documentElement.classList.toggle('has-global-background', enabled),
  { immediate: true, flush: 'sync' }
)

onBeforeUnmount(() => {
  document.documentElement.classList.remove('has-global-background')
})
</script>

<template>
  <div v-if="isEnabled" class="global-background-container">
    <div
      class="global-background-media"
      :style="{
        opacity: bgOpacity,
        filter: `blur(${bgBlur}px) brightness(${bgBrightness})`
      }"
    >
      <video
        v-if="bgType === 'video'"
        ref="videoRef"
        :src="bgUrl"
        loop
        muted
        autoplay
        playsinline
        class="bg-video"
      ></video>
      <img v-else class="bg-image" :src="bgUrl" alt="" draggable="false" />
    </div>
  </div>
</template>

<style scoped>
.global-background-container {
  position: fixed;
  top: 0;
  left: 0;
  right: -1px;
  bottom: -1px;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
  background-color: rgb(var(--wallpaper-page-rgb));
}

.global-background-media {
  position: absolute;
  top: -10%;
  left: -10%;
  width: 120%;
  height: 120%;
  transition: all 0.3s ease;
}

.bg-video,
.bg-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
</style>

<style>
/* Read the effective theme from the same root attribute as the theme styles, including
   follow-system changes. No JS snapshot of isDarkMode or injected style ordering. */
:root.has-global-background {
  --wallpaper-container-rgb: 255, 255, 255;
  --wallpaper-page-rgb: 243, 243, 243;
  --wallpaper-hover-rgb: 0, 0, 0;
  --td-bg-color-container: rgba(var(--wallpaper-container-rgb), 0.3) !important;
  --td-bg-color-page: transparent !important;
  --td-bg-color-secondarycontainer: rgba(var(--wallpaper-page-rgb), 0.2) !important;
  --td-bg-color-component: rgba(var(--wallpaper-container-rgb), 0.3) !important;
  --td-bg-color-component-hover: rgba(var(--wallpaper-hover-rgb), 0.05) !important;
  --td-bg-color-component-active: rgba(var(--wallpaper-hover-rgb), 0.1) !important;
  --list-content-bg: rgba(var(--wallpaper-container-rgb), 0.3) !important;
}

:root.has-global-background[data-theme='dark'] {
  --wallpaper-container-rgb: 36, 36, 36;
  --wallpaper-page-rgb: 24, 24, 24;
  --wallpaper-hover-rgb: 255, 255, 255;
}

/* Keep the negative wallpaper layer inside the provider, above its own background. */
:root.has-global-background .app-provider {
  isolation: isolate;
}

:root.has-global-background .home-container .sidebar {
  background-image: none !important;
  background-color: rgba(var(--wallpaper-container-rgb), 0.2) !important;
  backdrop-filter: blur(10px);
}

:root.has-global-background .home-container .content {
  background-image: none !important;
}

:root.has-global-background .home-container .header,
:root.has-global-background .mainContent {
  background: transparent !important;
}

:root.has-global-background .scrollable-content {
  background: rgba(var(--wallpaper-container-rgb), 0.3) !important;
  backdrop-filter: blur(8px);
}

/* Wallpaper transparency belongs to the page, not foreground dialogs or their controls. */
:root.has-global-background .t-dialog {
  --td-bg-color-container: rgb(var(--wallpaper-container-rgb));
  --td-bg-color-page: rgb(var(--wallpaper-page-rgb));
  --td-bg-color-secondarycontainer: rgb(var(--wallpaper-page-rgb));
  --td-bg-color-component: rgba(var(--wallpaper-hover-rgb), 0.06);
  --td-bg-color-component-hover: rgba(var(--wallpaper-hover-rgb), 0.1);
  --td-bg-color-component-active: rgba(var(--wallpaper-hover-rgb), 0.14);
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  box-shadow: 0 20px 64px rgba(0, 0, 0, 0.24);
}
</style>
