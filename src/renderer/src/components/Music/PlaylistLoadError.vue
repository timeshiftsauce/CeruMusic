<template>
  <div
    class="playlist-load-error"
    :class="{ 'has-songs': hasSongs }"
    role="status"
    aria-live="polite"
  >
    <div class="playlist-error-icon" aria-hidden="true">
      <t-icon name="music" size="28px" />
    </div>
    <div class="playlist-error-copy">
      <h3>{{ hasSongs ? '暂时无法加载更多歌曲' : '暂时无法加载这张歌单' }}</h3>
      <p>{{ message }}</p>
    </div>
    <t-button theme="default" variant="outline" :loading="loading" @click="$emit('retry')">
      <template #icon><t-icon name="refresh" /></template>重新加载
    </t-button>
  </div>
</template>
<script setup lang="ts">
defineProps<{ message: string; hasSongs?: boolean; loading?: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<style scoped lang="scss">
.playlist-load-error {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 32px 24px;
  text-align: center;
  .playlist-error-icon {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: var(--td-bg-color-secondarycontainer);
    color: var(--td-text-color-placeholder);
  }
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.5;
    color: var(--td-text-color-primary);
  }
  p {
    margin: 8px 0 0;
    max-width: 36em;
    font-size: 13px;
    color: var(--td-text-color-secondary);
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .t-button {
    flex-shrink: 0;
    padding-inline: 16px;
  }
  &.has-songs {
    flex: 0 0 auto;
    flex-direction: row;
    justify-content: flex-start;
    padding: 16px 24px;
    gap: 14px;
    text-align: left;
    border-bottom: 1px solid var(--td-component-stroke);
  }
  &.has-songs .playlist-error-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    flex-shrink: 0;
  }
  &.has-songs .playlist-error-copy {
    flex: 1;
    min-width: 0;
  }
  &.has-songs p {
    margin-top: 4px;
  }
}
</style>
