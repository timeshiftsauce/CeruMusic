<script setup lang="ts">
/**
 * 待审批面板 —— admin+ 操作普通成员的点歌请求
 *
 * 展示：歌名 / 歌手 / 点歌人 / 时间
 * 同曲多人申请会合并为一条,在点歌人位置显示头像堆叠
 * 操作：[通过] / [拒绝]
 *
 * 普通成员视角也能看到此面板（透明），但操作按钮 disabled。
 * 是否显示该 Tab 由 ListenTogetherOverlay 根据 canControl 控制。
 */
import { computed } from 'vue'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import { CheckIcon, CloseIcon, MusicIcon } from 'tdesign-icons-vue-next'
import type { PendingItem, PendingRequester } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()

function approve(item: PendingItem): void {
  lt.approveSong(item.reqId)
}
function reject(item: PendingItem): void {
  lt.rejectSong(item.reqId)
}

/** 兼容旧服务端 —— 没下发 requesters 时回落到 [{requesterId, requesterName}] */
function getRequesters(item: PendingItem): PendingRequester[] {
  if (Array.isArray(item.requesters) && item.requesters.length > 0) return item.requesters
  return [{ userId: item.requesterId, nickname: item.requesterName }]
}

/** 头像堆叠最多展示几个,超出显示 +N */
const MAX_AVATAR = 3

function visibleAvatars(item: PendingItem): PendingRequester[] {
  return getRequesters(item).slice(0, MAX_AVATAR)
}
function overflowCount(item: PendingItem): number {
  return Math.max(0, getRequesters(item).length - MAX_AVATAR)
}
function requesterTitle(item: PendingItem): string {
  return getRequesters(item)
    .map((r) => r.nickname)
    .join('、')
}
function requesterCountLabel(item: PendingItem): string {
  const n = getRequesters(item).length
  return n > 1 ? `${n} 人申请` : getRequesters(item)[0].nickname
}

function fmtTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/* 让 v-for 拿 stable ref —— pending 数组可能在父组件层级被反复替换 */
const items = computed(() => lt.pending)
</script>

<template>
  <div class="pending-panel">
    <div v-if="!items.length" class="empty">
      <p>暂无待审批的点歌</p>
      <p class="hint">普通成员点歌后，会出现在这里等你处理</p>
    </div>

    <ul v-else class="items">
      <li v-for="item in items" :key="item.reqId" class="item">
        <div class="cover">
          <img v-if="item.song.cover" :src="item.song.cover" alt="cover" />
          <MusicIcon v-else size="20" />
        </div>
        <div class="info">
          <div class="title">{{ item.song.name || '未知歌曲' }}</div>
          <div class="sub">
            {{ item.song.singer || '—' }}
            <span class="dot">·</span>
            <div class="requesters" :title="requesterTitle(item)">
              <div class="avatar-stack">
                <div
                  v-for="(r, i) in visibleAvatars(item)"
                  :key="r.userId"
                  class="avatar"
                  :style="{ zIndex: visibleAvatars(item).length - i }"
                >
                  <img v-if="r.avatar" :src="r.avatar" alt="" />
                  <span v-else class="avatar-fallback">
                    {{ (r.nickname || '?').slice(0, 1).toUpperCase() }}
                  </span>
                </div>
                <div v-if="overflowCount(item)" class="avatar avatar-more">
                  +{{ overflowCount(item) }}
                </div>
              </div>
              <span class="requester-label">{{ requesterCountLabel(item) }}</span>
            </div>
            <span class="dot">·</span>
            <span class="time">{{ fmtTime(item.requestedAt) }}</span>
          </div>
        </div>
        <div class="actions">
          <t-button
            theme="primary"
            variant="outline"
            size="small"
            :title="`通过 ${requesterTitle(item)} 的点歌`"
            @click="approve(item)"
          >
            <template #icon><CheckIcon /></template>
            通过
          </t-button>
          <t-button
            theme="danger"
            variant="text"
            size="small"
            :title="`拒绝 ${requesterTitle(item)} 的点歌`"
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
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  white-space: nowrap;

  .dot {
    opacity: 0.5;
  }
  .time {
    margin-left: auto;
  }
}

/* ---- 头像堆叠 ---- */
.requesters {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.avatar-stack {
  display: flex;
  align-items: center;

  .avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    overflow: hidden;
    border: 1.5px solid rgba(20, 22, 28, 0.92);
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: -6px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);

    &:first-child {
      margin-left: 0;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  .avatar-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #6691ff, #93b6ff);
    color: #fff;
    font-size: 9px;
    font-weight: 700;
  }

  .avatar-more {
    background: rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.85);
    font-size: 9px;
    font-weight: 600;
  }
}

.requester-label {
  color: var(--lt-accent-soft, #82aaff);
  font-weight: 500;
}

.actions {
  flex: 0 0 auto;
  display: flex;
  gap: 4px;
}
</style>
