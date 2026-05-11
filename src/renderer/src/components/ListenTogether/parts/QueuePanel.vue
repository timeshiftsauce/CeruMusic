<script setup lang="ts">
/**
 * 共享播放列表面板 —— 一起听浮层内的"列表" Tab
 *
 * 这里展示的是房间权威播放列表。房主/admin 可直接点歌切换；
 * 普通成员只能查看，或移除自己点过的歌。
 */
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import { CloseIcon, MusicIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
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

function handlePlay(item: QueueItem): void {
  if (!lt.canControl) {
    MessagePlugin.warning('当前没有播放控制权')
    return
  }
  if (isCurrentItem(item)) {
    lt.seek(0)
    lt.play(0)
    return
  }
  lt.playQueueItem(item.itemId)
}

function isCurrentItem(item: QueueItem): boolean {
  return (
    Boolean(lt.current.song) &&
    String(item.song.songmid) === String(lt.current.song?.songmid) &&
    item.song.source === lt.current.song?.source
  )
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="queue-panel">
    <div v-if="!lt.queue.length" class="empty">
      <MusicIcon size="32" />
      <p>共享播放列表为空</p>
      <p class="hint">
        {{ lt.canControl ? '修改播放列表会同步给房间成员' : '房主或管理员更新后会自动同步' }}
      </p>
    </div>

    <ul v-else class="items">
      <li
        v-for="(item, i) in lt.queue"
        :key="item.itemId"
        class="item"
        :class="{ active: isCurrentItem(item), clickable: lt.canControl }"
        @click="handlePlay(item)"
      >
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
            <span class="requester">由 {{ item.requesterName }} 添加</span>
            <span class="dot">·</span>
            <span>{{ fmtTime(item.addedAt) }}</span>
          </div>
        </div>
        <t-button
          v-if="canRemove(item)"
          variant="text"
          shape="circle"
          size="small"
          :title="lt.canControl ? '从共享列表移除' : '取消我的点歌'"
          @click.stop="handleRemove(item)"
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
  /* 与 ChatPanel 一致的沉浸滚动条:8px 宽,半透明白 thumb,无 track */
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

  &.clickable {
    cursor: pointer;
  }

  &.active {
    background: rgba(255, 255, 255, 0.1);

    .index {
      color: var(--lt-accent-soft, #82aaff);
      font-weight: 700;
    }

    .title {
      color: var(--lt-accent-soft, #82aaff);
    }
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

/* 删除按钮的 icon 在深色背景下用半透明白,hover 加深;disabled 时更淡 */
.item :deep(.t-button) {
  color: rgba(255, 255, 255, 0.55);
  &:hover {
    color: rgba(255, 255, 255, 0.92);
    background-color: rgba(255, 255, 255, 0.12) !important;
  }
}
.item :deep(.t-icon) {
  color: inherit;
  font-size: 16px;
}
</style>
