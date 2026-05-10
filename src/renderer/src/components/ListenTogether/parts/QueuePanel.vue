<script setup lang="ts">
/**
 * 点歌队列面板 —— 一起听浮层内的"队列" Tab
 *
 * 展示已通过审批、即将自动播放的曲目列表
 * 操作权限：admin+ 可删任意；普通成员仅自己点的可删
 */
import { useListenTogetherStore } from '@renderer/store'
import { CloseIcon, MusicIcon } from 'tdesign-icons-vue-next'
import type { QueueItem } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()

function canRemove(item: QueueItem): boolean {
  if (lt.canControl) return true
  return item.requesterId === lt.myUserId
}

function handleRemove(item: QueueItem): void {
  if (!canRemove(item)) return
  lt.removeFromQueue(item.itemId)
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="queue-panel">
    <div v-if="!lt.queue.length" class="empty">
      <MusicIcon size="32" />
      <p>队列空空如也</p>
      <p class="hint">
        {{ lt.canControl ? '在歌单/搜索页选首歌就能加进队列' : '点歌请等管理员审批通过' }}
      </p>
    </div>

    <ul v-else class="items">
      <li v-for="(item, i) in lt.queue" :key="item.itemId" class="item">
        <div class="index">{{ i + 1 }}</div>
        <div class="cover">
          <img v-if="item.song.cover" :src="item.song.cover" alt="cover" />
          <MusicIcon v-else size="20" />
        </div>
        <div class="info">
          <div class="title" :title="item.song.name">
            {{ item.song.name || '未知歌曲' }}
          </div>
          <div class="sub">
            <span>{{ item.song.singer || '—' }}</span>
            <span class="dot">·</span>
            <span class="requester">{{ item.requesterName }} 点</span>
            <span class="dot">·</span>
            <span>{{ fmtTime(item.addedAt) }}</span>
          </div>
        </div>
        <t-button
          v-if="canRemove(item)"
          variant="text"
          shape="circle"
          size="small"
          :title="lt.canControl ? '从队列删除' : '取消我的点歌'"
          @click="handleRemove(item)"
        >
          <CloseIcon />
        </t-button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.queue-panel {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }
}

.empty {
  text-align: center;
  padding: 48px 16px;
  color: rgba(255, 255, 255, 0.55);

  p {
    margin: 8px 0 0;
    font-size: 13px;
  }
  .hint {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }
}

.items {
  list-style: none;
  margin: 0;
  padding: 8px 0;
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
}

.index {
  flex: 0 0 auto;
  width: 20px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-variant-numeric: tabular-nums;
}

.cover {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.info {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  .dot {
    opacity: 0.5;
  }
  .requester {
    color: var(--lt-accent-soft, #82aaff);
  }
}
</style>
