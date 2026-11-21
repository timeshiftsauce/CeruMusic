<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { reactive } from 'vue'
import { CodeIcon, LogoChromeIcon, ThunderIcon } from 'tdesign-icons-vue-next'

const versions = reactive({ ...desktopBridge.electron.process.versions })
</script>

<template>
  <ul class="versions">
    <li>
      <ThunderIcon class="version-icon" /> <span>Electron v{{ versions.electron }}</span>
    </li>
    <li>
      <LogoChromeIcon class="version-icon" /> <span>Chromium v{{ versions.chrome }}</span>
    </li>
    <li>
      <CodeIcon class="version-icon" /> <span>Node v{{ versions.node }}</span>
    </li>
  </ul>
</template>

<style lang="scss" scoped>
.versions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--settings-tech-item-bg, #f8fafc);
    border-radius: 0.5rem;
    border: 1px solid var(--settings-tech-item-border, #e2e8f0);
    color: var(--settings-text-primary, #1e293b);
    font-size: 0.875rem;
    font-weight: 500;
    transition: background-color 0.2s ease;

    &:hover {
      background: var(--settings-nav-hover-bg, #f1f5f9);
    }
  }

  .version-icon {
    flex: 0 0 18px;
    color: var(--td-brand-color-5);
    font-size: 18px;
  }
}
</style>
