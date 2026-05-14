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
import { CloseIcon, CopyIcon, ShareIcon, UsergroupIcon, SettingIcon } from 'tdesign-icons-vue-next'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
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

type TabKey = 'chat' | 'queue' | 'pending'
const activeTab = ref<TabKey>('chat')

/**
 * Tab 切换动画方向 —— 根据"上一次 tab 索引 vs 新 tab 索引"决定 slide 方向
 *
 * 设计:
 *  - 左 → 右(索引变大):新内容从右侧滑入,旧内容向左滑出     → name='lt-tab-forward'
 *  - 右 → 左(索引变小):新内容从左侧滑入,旧内容向右滑出     → name='lt-tab-backward'
 * 用一个 ref 记录方向,模板里根据它选 transition name。
 *
 * 不直接 watch activeTab 改方向,而是封装 setTab():保证方向计算和值变化在同一帧,
 * 避免连点两次产生方向错乱(watch 是异步,activeTab 已经更新两次但方向只更新一次)。
 */
const TAB_ORDER: TabKey[] = ['chat', 'queue', 'pending']
const tabDirection = ref<'forward' | 'backward'>('forward')

/**
 * 切换 tab —— 入参签名兼容 n-tabs 的 @update:value(它给的是 string | number)。
 * 非法 key 直接忽略,避免 activeTab 被污染。
 */
function setTab(next: string | number): void {
  if (typeof next !== 'string') return
  if (!TAB_ORDER.includes(next as TabKey)) return
  const target = next as TabKey
  if (target === activeTab.value) return
  const prev = activeTab.value
  tabDirection.value = TAB_ORDER.indexOf(target) > TAB_ORDER.indexOf(prev) ? 'forward' : 'backward'
  activeTab.value = target
}

/**
 * 子视图路由 —— 在主面板内做"主视图 ↔ 设置视图"切换,不接入 vue-router
 *
 * 为什么不用 vue-router:
 *  - 一起听浮层叠在 FullPlay 内,主路由是 /home/play,不希望浮层的子页污染历史栈
 *  - 浮层关闭/重开时设置面板应回到主视图,vue-router 需要额外清理状态
 *  - 切换动画用 <Transition> 比 router-view 更轻量
 *
 * 切换:settings 按钮 → setView('settings');SettingsPanel emit('back') → setView('main')
 */
type SubView = 'main' | 'settings'
const subView = ref<SubView>('main')

function openSettings(): void {
  subView.value = 'settings'
}

function backToMain(): void {
  subView.value = 'main'
}

/** 浮层关闭/重开时把视图复位到主视图,避免重开就直接是设置页 */
watch(
  () => lt.overlayVisible,
  (v) => {
    if (!v) subView.value = 'main'
  }
)

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
              <span class="code-chip" :title="`点击复制口令 ${lt.meta?.code}`" @click="copyCode">
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
            <button class="action-btn" :title="'设置'" @click="openSettings">
              <SettingIcon size="16" />
            </button>
            <button class="action-btn" :title="'复制分享文案'" @click="shareRoom">
              <ShareIcon size="16" />
              <span>分享</span>
            </button>
            <button class="action-btn danger" @click="leaveRoom">退出</button>
          </div>
        </header>

        <!-- 主视图 / 设置视图 切换 -->
        <div class="lt-view-stack">
          <Transition :name="subView === 'settings' ? 'lt-sub-slide' : 'lt-sub-slide-back'">
            <div v-if="subView === 'main'" key="main" class="lt-view">
              <!-- 成员条 -->
              <div class="lt-members">
                <MemberStrip />
              </div>

              <!-- Tabs ——
                   用 naive-ui n-tabs(type=line, animated 自带横向滑动动画 + 高亮下划线滑动)
                   - v-model:value 绑定 activeTab,内部走 setTab 以维持 tabDirection(虽然 n-tabs
                     自己也有动画,这里保留 setTab 是为了将来手动触发场景一致)
                   - pane 内放面板组件;pending 通过 v-if 控制是否渲染 tab -->
              <n-tabs
                class="lt-ntabs"
                :value="activeTab"
                type="line"
                animated
                size="small"
                @update:value="setTab"
              >
                <n-tab-pane name="chat" tab="聊天" display-directive="if">
                  <ChatPanel class="content-fill" />
                </n-tab-pane>

                <n-tab-pane name="queue" display-directive="if">
                  <template #tab>
                    共享列表
                    <span v-if="lt.queue.length" class="count">{{ lt.queue.length }}</span>
                  </template>
                  <QueuePanel class="content-fill" />
                </n-tab-pane>

                <n-tab-pane v-if="showPendingTab" name="pending" display-directive="if">
                  <template #tab>
                    待审批
                    <span v-if="pendingCount" class="count badge">{{ pendingCount }}</span>
                  </template>
                  <PendingPanel class="content-fill" />
                </n-tab-pane>
              </n-tabs>
            </div>

            <div v-else key="settings" class="lt-view">
              <SettingsPanel @back="backToMain" />
            </div>
          </Transition>
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

/* ---------------- Tabs (n-tabs 覆盖) ---------------- */

/* n-tabs 默认是浅色主题,这里强制覆盖成浮层的深色风格。
 * 关键点:
 *  - .n-tabs-nav:整条 tab bar,加底分隔线,与原 .lt-tabs 保持一致
 *  - .n-tabs-tab:每个 tab 标签;未选中半透明,hover/选中走主题色
 *  - .n-tabs-bar:n-tabs 自带的下划线滑块,直接染色 + 阴影
 *  - .n-tab-pane:面板内容区,需要 flex:1 让 ChatPanel 等填满
 *  - animated 模式下,n-tabs 内部用 transform 平移整条 pane-wrapper,
 *    所以无需再写自定义 Transition CSS */
.lt-ntabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  :deep(.n-tabs-nav) {
    padding: 0 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);

    .n-tabs-nav-scroll-content {
      border-bottom: none;
    }
  }

  /* 关键:tab 标签不撑满,紧凑靠左排列,gap 控制间距 */
  :deep(.n-tabs-tab-wrapper) {
    margin-right: 0;
  }

  /* n-tabs 默认在 tab 之间插入 .n-tabs-tab-pad(占位元素)用来撑开间距,
   * 默认值约 36px,在浮层这种紧凑布局里太大,压到 4px */
  :deep(.n-tabs-tab-pad) {
    width: 4px !important;
  }

  :deep(.n-tabs-tab) {
    /* 内部用相对定位 —— 给 .count 提供绝对定位锚点
     * padding 让下划线宽度 > 文字宽度,视觉更舒展 */
    position: relative;
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
    padding: 10px 16px !important;
    margin: 0 !important;
    transition: color 0.2s;

    &:hover {
      color: rgba(255, 255, 255, 0.85);
    }

    &.n-tabs-tab--active {
      color: #fff;
    }

    /* 徽标(共享列表 / 待审批数量)用绝对定位浮在 tab 右上角,
     * 不参与 tab 宽度计算 → 文字始终视觉居中,n-tabs-bar 下划线也居中对齐 */
    .count {
      position: absolute;
      top: 2px;
      right: -2px;
      font-size: 10px;
      line-height: 1;
      opacity: 0.85;
      padding: 2px 5px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.15);
      pointer-events: none;

      &.badge {
        background: rgb(255, 90, 90);
        color: #fff;
        opacity: 1;
      }
    }
  }

  :deep(.n-tabs-bar) {
    background-color: v-bind(mainColor) !important;
    box-shadow: 0 0 8px v-bind(mainColor);
    border-radius: 1px;
    height: 2px;
  }

  /* ---- 修复 animated 切换瞬间高度塌陷 ----
   * n-tabs animated 模式实际 DOM:
   *   .n-tabs-pane-wrapper(外层,固定可视区)
   *     └ .n-tabs-panes(横向轨道,用 transform 平移)
   *         ├ .n-tab-pane(每个 pane,inline-block)
   *         └ .n-tab-pane
   * 问题:切换瞬间,新旧 pane 都在轨道里并排,如果 pane 自身用 flex:1 取高,
   *      它依赖父级 .n-tabs-panes 的高度,但 .n-tabs-panes 是 inline 排版,
   *      不传递高度 → ChatPanel 内的 flex:1 链断裂 → 整个面板瞬间塌成 0。
   * 解法:
   *   1) pane-wrapper 自己 flex:1 + 固定高度链
   *   2) panes 容器 height:100% 把高度传下去
   *   3) 每个 pane 也 height:100%,用 block + flex 列布局 */
  :deep(.n-tabs-pane-wrapper) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  :deep(.n-tabs-panes) {
    height: 100%;
  }

  :deep(.n-tab-pane) {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0 !important;
  }
}

.content-fill {
  flex: 1;
  min-height: 0;
}

/* ---------------- 进入/退出动画 ---------------- */

.lt-overlay-fade-enter-active,
.lt-overlay-fade-leave-active {
  transition:
    opacity 0.25s ease,
    backdrop-filter 0.25s ease;

  .lt-card {
    transition:
      transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 0.25s ease;
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

/* ---------------- 子视图(主面板 ↔ 设置面板)切换 ---------------- */

/* 父容器需要 relative + overflow:hidden,让两个 lt-view 在切换瞬间能叠 + 滑出 */
.lt-view-stack {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
}

.lt-view {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 主 → 设置:新视图从右侧滑入,旧视图向左滑出 */
.lt-sub-slide-enter-active,
.lt-sub-slide-leave-active {
  transition:
    transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.2s ease;
}
.lt-sub-slide-enter-from {
  transform: translateX(40px);
  opacity: 0;
}
.lt-sub-slide-leave-to {
  transform: translateX(-40px);
  opacity: 0;
}

/* 设置 → 主:反向(新视图从左,旧视图向右) */
.lt-sub-slide-back-enter-active,
.lt-sub-slide-back-leave-active {
  transition:
    transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.2s ease;
}
.lt-sub-slide-back-enter-from {
  transform: translateX(-40px);
  opacity: 0;
}
.lt-sub-slide-back-leave-to {
  transform: translateX(40px);
  opacity: 0;
}
</style>
