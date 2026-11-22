<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AppIcon } from 'tdesign-icons-vue-next'
const props = defineProps<{url?:string;monochrome?:boolean}>()
const failed = ref(false)
watch(() => props.url, () => { failed.value = false })
const image = computed(() => !failed.value && props.url && /^data:image\/(?:svg\+xml|png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(props.url) ? props.url : undefined)
</script>
<template>
  <span class="sidebar-page-icon" aria-hidden="true">
    <span v-if="image && monochrome" class="tinted-icon" :style="{ maskImage: 'url('+image+')' }" />
    <img v-else-if="image" :src="image" alt="" @error="failed=true" />
    <AppIcon v-else class="fallback-icon" />
  </span>
</template>
<style scoped>
.sidebar-page-icon > * {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.tinted-icon {
  background: currentColor;
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}
</style>
