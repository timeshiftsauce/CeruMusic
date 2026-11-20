<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { reactive } from 'vue'

const versions = reactive({ ...desktopBridge.electron.process.versions })
</script>

<template>
  <ul class="versions">
    <li class="electron-version">Electron v{{ versions.electron }}</li>
    <li class="chrome-version">Chromium v{{ versions.chrome }}</li>
    <li class="node-version">Node v{{ versions.node }}</li>
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
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--settings-tech-item-bg, #f8fafc);
    border-radius: 0.5rem;
    border: 1px solid var(--settings-tech-item-border, #e2e8f0);
    color: var(--settings-text-primary, #1e293b);
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;

    &:hover {
      background: var(--settings-nav-hover-bg, #f1f5f9);
    }
  }

  .electron-version {
    &::before {
      content: '⚡';
      margin-right: 0.5rem;
    }
  }

  .chrome-version {
    &::before {
      content: '🌐';
      margin-right: 0.5rem;
    }
  }

  .node-version {
    &::before {
      content: '🟢';
      margin-right: 0.5rem;
    }
  }
}
</style>
