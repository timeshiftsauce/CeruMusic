<script setup lang="ts">
/**
 * 一起听浮层 —— 叠加在 FullPlay 内部，与 CommentsOverlay 平行的浮层组件
 *
 * 设计理念：
 *  - 不另开页面，直接在全屏播放器内浮起一个毛玻璃卡片
 *  - 底部播放器/全屏播放器原生的播放控制依然是房间播放控制
 *    （store 通过 ControlAudio publish 桥接，host 端切歌/控制自动广播）
 *  - 关闭浮层不离开房间，只是隐藏 UI
 *
 * 布局：
 *   ┌─顶栏─[X][房间名][口令][分享][离开]──────┐
 *   ├──────────────────────────────────────┤
 *   │  成员条（横向头像）                  │
 *   ├──────────────────────────────────────┤
 *   │  Tab：聊天 / 共享列表 / 待审批       │
 *   │  ┌────────────────────────────────┐  │
 *   │  │ 内容区                          │  │
 *   │  └────────────────────────────────┘  │
 *   └──────────────────────────────────────┘
 *
 * 与 CommentsOverlay 一致的特性：
 *  - mainColor 主题色透传（来自封面取色）
 *  - 80vw x 80vh 居中卡片，外层 fullscreen 半透明 + blur
 *  - ESC 关闭
 */
import { computed, ref, watch } from 'vue'
import { CloseIcon, CopyIcon, ShareIcon, UsergroupIcon } from 'tdesign-icons-vue-next'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { useListenTogetherStore } from '@renderer/store'
import MemberStrip from '@renderer/components/ListenTogether/parts/MemberStrip.vue'
import ChatPanel from '@renderer/components/ListenTogether/parts/ChatPanel.vue'
import QueuePanel from '@renderer/components/ListenTogether/parts/QueuePanel.vue'
import PendingPanel from '@renderer/components/ListenTogether/parts/PendingPanel.vue'
import { buildShareText } from '@renderer/components/ListenTogether/parts/shareTextHelper'

withDefaults(
  defineProps<{
    show: boolean
    /** 主题色 —— 从封面取色，用于强调（tab active 下划线、自己消息气泡） */
    mainColor?: string
  }>(),
  {
    mainColor: 'var(--td-brand-color)'
  }
)

const emit = defineEmits<{ (e: 'close'): void }>()

const lt = useListenTogetherStore()

/* ---------------- Tab 切换 ---------------- */

const activeTab = ref<'chat' | 'queue' | 'pending'>('chat')

/** admin+ 在 group 模式才看待审批 tab */
const showPendingTab = computed(() => lt.canControl && lt.meta?.mode === 'group')

/** 待审批红点数量 —— 给 admin+ 看的提醒 */
const pendingCount = computed(() => lt.pending.length)

/* 当浮层打开 / 房间切换时，自动选 chat tab，避免停留在不可见的 pending */
watch(
  () => [lt.meta?.code, lt.canControl],
  () => {
    if (activeTab.value === 'pending' && !showPendingTab.value) {
      activeTab.value = 'chat'
    }
  }
)

/* ---------------- 顶栏动作 ---------------- */

function copyCode(): void {
  const code = lt.meta?.code
  if (!code) return
  navigator.clipboard
    ?.writeText(code)
    .then(() => MessagePlugin.success('口令已复制'))
    .catch(() => MessagePlugin.warning('复制失败，请手动选中'))
}

function shareRoom(): void {
  const meta = lt.meta
  if (!meta) return
  /* 用自己在房间内的真实昵称生成分享文案,而不是硬编码 "我" */
  const me = lt.members.find((m) => m.userId === lt.myUserId)
  const myNickname = me?.nickname || '某位朋友'
  const text = buildShareText(myNickname, meta.code)
  navigator.clipboard
    ?.writeText(text)
    .then(() => MessagePlugin.success('分享文案已复制，去粘贴给朋友吧'))
    .catch(() => MessagePlugin.warning('复制失败'))
}

function leaveRoom(): void {
  /* tdesign DialogPlugin.confirm 的 onConfirm 默认不会关闭弹窗(等业务方
   * 显式 destroy),所以需要拿到 dialog 引用,在 onConfirm/onCancel 里手动
   * dialog.destroy() —— 否则会出现"已离开但弹窗还在"的现象。 */
  const dialog = DialogPlugin.confirm({
    header: '确定离开房间？',
    body: lt.isOwner
      ? '你是房主，离开后房主会自动转移给其他成员。'
      : '可以再回来，房间会保留 30 分钟。',
    confirmBtn: { content: '离开', theme: 'danger' },
    cancelBtn: '取消',
    onConfirm: () => {
      lt.leaveRoom()
      emit('close')
      dialog.destroy()
    },
    onCancel: () => dialog.destroy(),
    onClose: () => dialog.destroy()
  })
}

/* ESC 关闭 */
function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Transition name="lt-overlay-fade">
    <div
      v-if="show"
      class="lt-overlay"
      tabindex="-1"
      @keydown="onKeyDown"
      @click.self="emit('close')"
    >
      <div class="lt-card">
        <!-- 顶栏 -->
        <header class="lt-header">
          <button class="close-btn" :title="'关闭（Esc）'" @click="emit('close')">
            <CloseIcon size="18" />
          </button>

          <div class="room-info">
            <h2 class="room-name">{{ lt.meta?.name || '一起听' }}</h2>
            <div class="room-meta">
              <span
                class="code-chip"
                :title="`点击复制口令 ${lt.meta?.code}`"
                @click="copyCode"
              >
                <CopyIcon size="12" />
                {{ lt.meta?.code }}
              </span>
              <span class="dot">·</span>
              <span>
                {{ lt.meta?.mode === 'intimate' ? '亲密 · 2 人' : '多人房间' }}
              </span>
              <span class="dot">·</span>
              <span class="member-count">
                <UsergroupIcon size="12" />
                {{ lt.members.length }} / {{ lt.meta?.maxMembers }}
              </span>
            </div>
          </div>

          <div class="actions">
            <button class="action-btn" :title="'复制分享文案'" @click="shareRoom">
              <ShareIcon size="16" />
              <span>分享</span>
            </button>
            <button class="action-btn danger" @click="leaveRoom">
              退出
            </button>
          </div>
        </header>

        <!-- 成员条 -->
        <div class="lt-members">
          <MemberStrip />
        </div>

        <!-- Tabs -->
        <div class="lt-tabs">
          <div
            class="tab-item"
            :class="{ active: activeTab === 'chat' }"
            @click="activeTab = 'chat'"
          >
            聊天
          </div>
          <div
            class="tab-item"
            :class="{ active: activeTab === 'queue' }"
            @click="activeTab = 'queue'"
          >
            共享列表
            <span v-if="lt.queue.length" class="count">{{ lt.queue.length }}</span>
          </div>
          <div
            v-if="showPendingTab"
            class="tab-item"
            :class="{ active: activeTab === 'pending' }"
            @click="activeTab = 'pending'"
          >
            待审批
            <span v-if="pendingCount" class="count badge">{{ pendingCount }}</span>
          </div>
        </div>

        <!-- 内容区 -->
        <div class="lt-content">
          <ChatPanel v-if="activeTab === 'chat'" class="content-fill" />
          <QueuePanel v-else-if="activeTab === 'queue'" class="content-fill" />
          <PendingPanel
            v-else-if="activeTab === 'pending' && showPendingTab"
            class="content-fill"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
/* CSS 变量 —— 内部 panel 通过 var(--lt-accent) 用主题色 */
.lt-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);

  --lt-accent: v-bind(mainColor);
  --lt-accent-soft: v-bind(mainColor);
}

.lt-card {
  width: min(80vw, 880px);
  height: min(80vh, 720px);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(60px);
  -webkit-backdrop-filter: blur(60px);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
}

/* ---------------- Header ---------------- */

.lt-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.1);
}

.close-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.room-info {
  flex: 1;
  min-width: 0;
}

.room-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.95);
}

.room-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}

.dot {
  opacity: 0.5;
}

.code-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.95);
  font-family: ui-monospace, monospace;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
}

.member-count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.92);
  border: none;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  &.danger {
    color: rgb(255, 145, 145);
    &:hover {
      background: rgba(255, 80, 80, 0.18);
    }
  }
}

/* ---------------- Members strip ---------------- */

.lt-members {
  padding: 4px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

/* ---------------- Tabs ---------------- */

.lt-tabs {
  display: flex;
  gap: 24px;
  padding: 10px 24px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tab-item {
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  opacity: 0.6;
  position: relative;
  padding-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.2s;

  .count {
    font-size: 11px;
    opacity: 0.8;
    padding: 1px 6px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);

    &.badge {
      background: rgb(255, 90, 90);
      color: #fff;
      opacity: 1;
    }
  }

  &:hover {
    opacity: 0.85;
  }

  &.active {
    opacity: 1;

    &::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: v-bind(mainColor);
      border-radius: 1px;
      box-shadow: 0 0 8px v-bind(mainColor);
    }
  }
}

/* ---------------- Content ---------------- */

.lt-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.content-fill {
  flex: 1;
  min-height: 0;
}

/* ---------------- 进入/退出动画 ---------------- */

.lt-overlay-fade-enter-active,
.lt-overlay-fade-leave-active {
  transition: opacity 0.25s ease, backdrop-filter 0.25s ease;

  .lt-card {
    transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.25s ease;
  }
}

.lt-overlay-fade-enter-from,
.lt-overlay-fade-leave-to {
  opacity: 0;

  .lt-card {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }
}
</style>
