<script setup lang="ts">
/**
 * 待审批面板 —— admin+ 操作普通成员的点歌请求
 *
 * 展示：歌名 / 歌手 / 点歌人 / 时间
 * 操作：[通过] / [拒绝]
 *
 * 普通成员视角也能看到此面板（透明），但操作按钮 disabled。
 * 是否显示该 Tab 由 ListenTogetherOverlay 根据 canControl 控制。
 */
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import { CheckIcon, CloseIcon, MusicIcon } from 'tdesign-icons-vue-next'
import type { PendingItem } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()

function approve(item: PendingItem): void {
  lt.approveSong(item.reqId)
}
function reject(item: PendingItem): void {
  lt.rejectSong(item.reqId)
}

function fmtTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="pending-panel">
    <div v-if="!lt.pending.length" class="empty">
      <p>暂无待审批的点歌</p>
      <p class="hint">普通成员点歌后，会出现在这里等你处理</p>
    </div>

    <ul v-else class="items">
      <li v-for="item in lt.pending" :key="item.reqId" class="item">
        <div class="cover">
          <img v-if="item.song.cover" :src="item.song.cover" alt="cover" />
          <MusicIcon v-else size="20" />
        </div>
        <div class="info">
          <div class="title">{{ item.song.name || '未知歌曲' }}</div>
          <div class="sub">
            {{ item.song.singer || '—' }}
            <span class="dot">·</span>
            <span class="requester">{{ item.requesterName }}</span>
            <span class="dot">·</span>
            <span class="time">{{ fmtTime(item.requestedAt) }}</span>
          </div>
        </div>
        <div class="actions">
          <t-button
            theme="primary"
            variant="outline"
            size="small"
            :title="`通过 ${item.requesterName} 的点歌`"
            @click="approve(item)"
          >
            <template #icon><CheckIcon /></template>
            通过
          </t-button>
          <t-button
            theme="danger"
            variant="text"
            size="small"
            :title="`拒绝 ${item.requesterName} 的点歌`"
            @click="reject(item)"
          >
            <template #icon><CloseIcon /></template>
            拒绝
          </t-button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.pending-panel {
  height: 100%;
  overflow-y: auto;
  /* 与 ChatPanel/QueuePanel 一致的沉浸滚动条 */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
}

.empty {
  text-align: center;
  padding: 48px 16px;
  color: rgba(255, 255, 255, 0.5);

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
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  &:last-child {
    border-bottom: none;
  }
}

.cover {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
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
  margin-top: 2px;
  display: flex;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  .dot {
    opacity: 0.5;
  }
  .requester {
    color: var(--lt-accent-soft, #82aaff);
  }
  .time {
    margin-left: auto;
  }
}

.actions {
  flex: 0 0 auto;
  display: flex;
  gap: 4px;
}
</style>
