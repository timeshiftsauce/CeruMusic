<script setup lang="ts">
defineProps<{ src: string; alt: string }>()
</script>

<template>
  <figure class="plugin-diagram">
    <div class="plugin-diagram-scroll" tabindex="0" role="region" :aria-label="alt">
      <img :src="src" :alt="alt" width="1200" />
    </div>
    <figcaption>
      窄屏可横向滚动图解 ·
      <a :href="src" target="_blank" rel="noopener"
        >查看原图<span class="sr-only">（新窗口）</span></a
      >
    </figcaption>
  </figure>
</template>

<style scoped>
.plugin-diagram {
  margin: 24px 0;
  max-width: 100%;
}
.plugin-diagram-scroll {
  overflow-x: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: #fff;
}
.plugin-diagram-scroll:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}
.plugin-diagram img {
  display: block;
  min-width: 760px;
  width: 100%;
  max-width: none;
  height: auto;
}
.plugin-diagram figcaption {
  margin-top: 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
