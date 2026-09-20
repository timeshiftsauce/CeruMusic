<script setup lang="ts">
import { withBase } from 'vitepress'
withDefaults(defineProps<{ step?: number }>(), { step: 0 })
const lessons = [
  { title: '运行插件', link: '/guide/plugins/v2/quick-start' },
  { title: '写一个命令', link: '/guide/plugins/v2/first-command' },
  { title: '添加搜索', link: '/guide/plugins/v2/first-search' },
  { title: '保存数据', link: '/guide/plugins/v2/first-storage' },
  { title: '安装到澜音', link: '/guide/plugins/v2/first-release' }
]
</script>

<template>
  <nav class="lesson-nav" aria-label="动手教程进度">
    <a
      v-for="(lesson, index) in lessons"
      :key="lesson.link"
      :href="withBase(lesson.link)"
      :aria-current="index === step ? 'step' : undefined"
    >
      <span class="lesson-number">{{ index + 1 }}</span
      ><span>{{ lesson.title }}</span>
    </a>
  </nav>
</template>

<style scoped>
.lesson-nav {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 14px 0;
  margin: 0 0 24px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.lesson-nav a {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 6px;
  text-decoration: none !important;
  color: var(--vp-c-text-2) !important;
}
.lesson-nav a[aria-current] {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1) !important;
  font-weight: 600;
}
.lesson-number {
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 50%;
  font-size: 11px;
}
</style>
