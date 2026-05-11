<script setup lang="ts">
/**
 * 横向成员条 —— 替代之前的纵向 MemberList
 *
 * 设计：浮层空间宝贵，把成员展示压缩成横向滚动头像条
 *  - 头像 32×32，悬浮显示昵称
 *  - 角色用左下角小角标（皇冠 / 盾牌）标识
 *  - 点击头像弹出成员操作菜单（仅 admin+ 看到操作项）
 */
import { computed } from 'vue'
import { DialogPlugin } from 'tdesign-vue-next'
import { useListenTogetherStore } from '@renderer/store'
import type { RoomMember, RoomRole } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()

/** 排序：房主 -> 管理员 -> 普通成员 */
const sortedMembers = computed(() => {
  const order: Record<RoomRole, number> = { owner: 0, admin: 1, member: 2 }
  return [...lt.members].sort((a, b) => order[a.role] - order[b.role])
})

function actionsFor(member: RoomMember): string[] {
  if (member.userId === lt.myUserId) return []
  const myRole = lt.myRole
  if (myRole === 'owner') {
    if (member.role === 'admin') return ['demote', 'kick']
    if (member.role === 'member') return ['promote', 'kick']
  }
  if (myRole === 'admin' && member.role === 'member') return ['kick']
  return []
}

function handleAction(action: string, m: RoomMember): void {
  if (action === 'promote') {
    lt.promoteAdmin(m.userId)
    return
  }
  if (action === 'demote') {
    lt.demoteAdmin(m.userId)
    return
  }
  if (action === 'kick') {
    /* tdesign DialogPlugin.confirm 的 onConfirm/Cancel/Close 默认不自动 destroy,
     * 必须显式 dialog.destroy() —— 否则会出现"点击确认看似无反应"(其实操作执行
     * 了但弹窗一直挂着挡住后续交互)。 */
    const dialog = DialogPlugin.confirm({
      header: `把 ${m.nickname} 移出房间？`,
      body: '此操作不可撤销，被踢用户可重新通过口令加入。',
      confirmBtn: { content: '确认踢出', theme: 'danger' },
      cancelBtn: '取消',
      onConfirm: () => {
        lt.kick(m.userId)
        dialog.destroy()
      },
      onCancel: () => dialog.destroy(),
      onClose: () => dialog.destroy()
    })
  }
}

/** 构造 dropdown options —— 把 onClick 直接挂在 option 上,
 * 避免依赖 t-dropdown @click 的事件签名(版本间可能不一致) */
function buildOptions(m: RoomMember) {
  return actionsFor(m).map((a) => ({
    content: a === 'promote' ? '设为管理员' : a === 'demote' ? '撤销管理员' : '踢出房间',
    value: a,
    theme: a === 'kick' ? ('error' as const) : ('default' as const),
    onClick: () => handleAction(a, m)
  }))
}

function initials(nickname: string): string {
  return (nickname || '?').slice(0, 1).toUpperCase()
}
</script>

<template>
  <div class="member-strip">
    <div
      v-for="m in sortedMembers"
      :key="m.userId"
      class="member-cell"
      :class="{ 'is-self': m.userId === lt.myUserId }"
      :title="`${m.nickname} · ${m.role}`"
    >
      <t-dropdown
        v-if="actionsFor(m).length"
        trigger="click"
        :options="buildOptions(m)"
      >
        <div class="avatar-wrap clickable">
          <img v-if="m.avatar" :src="m.avatar" class="avatar" :alt="m.nickname" />
          <div v-else class="avatar avatar-fallback">{{ initials(m.nickname) }}</div>
          <span
            v-if="m.role !== 'member'"
            class="role-badge"
            :class="`role-${m.role}`"
            :title="m.role === 'owner' ? '房主' : '管理员'"
          >
            <!-- 房主皇冠 / 管理员盾牌 — 内联 SVG 比 emoji 显得克制专业 -->
            <svg
              v-if="m.role === 'owner'"
              viewBox="0 0 24 24"
              width="10"
              height="10"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M12 3.5L8.6 8.2 4 5.6l1.5 9.4h13L20 5.6l-4.6 2.6L12 3.5zm-6.5 13h13v2h-13v-2z"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="10"
              height="10"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M12 2L4 5v6c0 4.6 3.4 8.9 8 10 4.6-1.1 8-5.4 8-10V5l-8-3zm-1.3 13.3L7 11.6l1.4-1.4 2.3 2.3 4.9-4.9L17 9z"
              />
            </svg>
          </span>
        </div>
      </t-dropdown>

      <div v-else class="avatar-wrap">
        <img v-if="m.avatar" :src="m.avatar" class="avatar" :alt="m.nickname" />
        <div v-else class="avatar avatar-fallback">{{ initials(m.nickname) }}</div>
        <span
          v-if="m.role !== 'member'"
          class="role-badge"
          :class="`role-${m.role}`"
          :title="m.role === 'owner' ? '房主' : '管理员'"
        >
          <svg
            v-if="m.role === 'owner'"
            viewBox="0 0 24 24"
            width="10"
            height="10"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M12 3.5L8.6 8.2 4 5.6l1.5 9.4h13L20 5.6l-4.6 2.6L12 3.5zm-6.5 13h13v2h-13v-2z"
            />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            width="10"
            height="10"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M12 2L4 5v6c0 4.6 3.4 8.9 8 10 4.6-1.1 8-5.4 8-10V5l-8-3zm-1.3 13.3L7 11.6l1.4-1.4 2.3 2.3 4.9-4.9L17 9z"
            />
          </svg>
        </span>
      </div>

      <span class="nickname">{{ m.nickname }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.member-strip {
  display: flex;
  gap: 12px;
  padding: 8px 4px;
  overflow-x: auto;
  scrollbar-width: thin;
  font-family: 'PingFangSC-Semibold', Helvetica, Arial, sans-serif;

  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 2px;
  }
}

.member-cell {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 56px;

  &.is-self .nickname {
    color: var(--td-brand-color-6, #366ef4);
    font-weight: 600;
  }
}

.avatar-wrap {
  position: relative;
  width: 36px;
  height: 36px;

  &.clickable {
    cursor: pointer;
    transition: transform 0.15s;
    &:hover {
      transform: scale(1.08);
    }
  }
}

.avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6691ff, #93b6ff);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}

.role-badge {
  position: absolute;
  bottom: -3px;
  right: -3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  /* 与头像背景拉开层次的细描边,让徽章像贴上去的小贴纸 */
  box-shadow:
    0 0 0 2px var(--td-bg-color-container, #fff),
    0 1px 3px rgba(0, 0, 0, 0.18);

  &.role-owner {
    /* 房主:暖金渐变,皇冠 + 富贵感 */
    background: linear-gradient(135deg, #f7c948 0%, #e09a1f 100%);
  }
  &.role-admin {
    /* 管理员:主题色一档,与气泡保持视觉一致 */
    background: var(--td-brand-color-5, #366ef4);
  }

  svg {
    display: block;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
  }
}

.nickname {
  font-size: 11px;
  max-width: 56px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit;
  opacity: 0.85;
}
</style>
