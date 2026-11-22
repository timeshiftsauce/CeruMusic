<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PaletteIcon } from 'tdesign-icons-vue-next'

const props = defineProps<{ url?: string }>()
const failed = ref(false)
watch(() => props.url, () => { failed.value = false })
const image = computed(() => !failed.value && typeof props.url === 'string' && /^data:image\/(?:svg\+xml|png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(props.url) ? props.url : undefined)
</script>

<template>
  <img v-if="image" :key="image" :src="image" alt="" @error="failed = true" />
  <PaletteIcon v-else size="26px" aria-hidden="true" />
</template>
