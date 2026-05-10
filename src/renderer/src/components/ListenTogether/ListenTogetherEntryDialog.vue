<script setup lang="ts">
/**
 * 一起听 入口对话框
 *
 * 一个组件支持两种模式：
 *  - mode='create' 显示创建表单（亲密 / 多人 + 房间名 + 最大人数）
 *  - mode='join'   显示加入输入框（支持粘贴整段分享文案，自动提取口令）
 *
 * 顶部一个 segmented 控件可以切换；
 * 提交成功后自动打开"一起听浮层"（叠加在 FullPlay 内部，不跳路由）。
 */
import { ref, watch, computed, nextTick } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useListenTogetherStore } from '@renderer/store'
import type { RoomMode } from '@renderer/utils/listenTogether/types'

const props = defineProps<{
  modelValue: boolean
  /** 默认展示哪种模式（创建 / 加入） */
  mode: 'create' | 'join'
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const lt = useListenTogetherStore()

/* 当前 tab —— 复制 mode 作为初始值，允许用户在弹框内自行切换 */
const activeTab = ref<'create' | 'join'>(props.mode)
watch(
  () => [props.modelValue, props.mode],
  ([visible, m]) => {
    if (visible) {
      activeTab.value = m as 'create' | 'join'
      // 弹出时聚焦输入框（join 场景）
      nextTick(() => {
        if (m === 'join') joinInputRef.value?.focus()
      })
    }
  }
)

/* ---------------- 创建表单 ---------------- */

const createForm = ref<{
  mode: RoomMode
  name: string
  maxMembers: number
}>({
  mode: 'group',
  name: '',
  maxMembers: 50
})
const createSubmitting = ref(false)

async function handleCreate(): Promise<void> {
  if (createSubmitting.value) return
  createSubmitting.value = true
  try {
    await lt.createAndJoin({
      mode: createForm.value.mode,
      // 亲密模式不需要房间名
      name:
        createForm.value.mode === 'intimate'
          ? undefined
          : createForm.value.name.trim() || undefined,
      maxMembers:
        createForm.value.mode === 'group' ? createForm.value.maxMembers : undefined
    })
    MessagePlugin.success('房间已创建')
    closeAndOpenOverlay()
  } catch (e: any) {
    console.error('[lt] 创建房间失败', e)
    MessagePlugin.error(e?.message || '创建房间失败')
  } finally {
    createSubmitting.value = false
  }
}

/* ---------------- 加入表单 ---------------- */

const joinInput = ref('')
const joinInputRef = ref<{ focus: () => void } | null>(null)
const joinSubmitting = ref(false)

/** 输入框右侧"已识别口令"提示 —— 实时正则匹配 */
const detectedCode = computed(() => {
  const m = joinInput.value.match(/#([A-Za-z0-9]{6})#/)
  if (m) return m[1].toUpperCase()
  // 也兼容用户直接粘 6 位口令
  const trimmed = joinInput.value.trim().toUpperCase()
  if (/^[A-HJ-NP-Z2-9]{6}$/.test(trimmed)) return trimmed
  return ''
})

async function handleJoin(): Promise<void> {
  if (joinSubmitting.value) return
  if (!joinInput.value.trim()) {
    MessagePlugin.warning('请输入口令或粘贴分享文案')
    return
  }
  joinSubmitting.value = true
  try {
    await lt.resolveAndJoin(joinInput.value)
    MessagePlugin.success('已加入房间')
    closeAndOpenOverlay()
  } catch (e: any) {
    // store 内已经做过 toast，这里不重复
    console.warn('[lt] 加入失败', e)
  } finally {
    joinSubmitting.value = false
  }
}

/* ---------------- 通用 ---------------- */

/**
 * 关闭入口对话框 + 打开一起听浮层
 *
 * 关键设计：不跳 router.push！
 * 而是触发 store.openOverlay() —— PlayMusic 监听该状态会自动展开 FullPlay，
 * FullPlay 内部挂的 ListenTogetherOverlay 显示房间内容。
 * 这样体验是"叠加在当前播放器上"，不离开当前页面、不切换路由。
 */
function closeAndOpenOverlay(): void {
  emit('update:modelValue', false)
  lt.openOverlay()
}

function close(): void {
  emit('update:modelValue', false)
}

/* 弹框打开时尝试自动从剪贴板检测口令（提升体验） */
async function autoDetectFromClipboard(): Promise<void> {
  try {
    if (!navigator.clipboard?.readText) return
    const text = await navigator.clipboard.readText()
    if (!text) return
    const m = text.match(/#([A-Za-z0-9]{6})#/)
    if (m && !joinInput.value) {
      joinInput.value = text
      activeTab.value = 'join'
    }
  } catch {
    // 用户没授予剪贴板权限或不可用，静默忽略
  }
}
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) void autoDetectFromClipboard()
  }
)
</script>

<template>
  <t-dialog
    :visible="modelValue"
    :on-close="close"
    :footer="false"
    :close-on-overlay-click="!createSubmitting && !joinSubmitting"
    width="480px"
    placement="center"
    header="一起听"
  >
    <!-- 模式切换 -->
    <t-radio-group
      v-model="activeTab"
      variant="default-filled"
      class="lt-tabs"
      :disabled="createSubmitting || joinSubmitting"
    >
      <t-radio-button value="create">创建房间</t-radio-button>
      <t-radio-button value="join">加入房间</t-radio-button>
    </t-radio-group>

    <!-- 创建表单 -->
    <div v-if="activeTab === 'create'" class="lt-form">
      <t-form label-align="top" :data="createForm" :disabled="createSubmitting">
        <t-form-item label="房间类型" name="mode">
          <t-radio-group v-model="createForm.mode" variant="default-filled" class="mode-radio">
            <t-radio-button value="intimate">
              <span class="mode-title">亲密 · 2 人</span>
              <span class="mode-desc">双方对等，都可控制</span>
            </t-radio-button>
            <t-radio-button value="group">
              <span class="mode-title">多人 · 最多 50</span>
              <span class="mode-desc">三级权限，点歌需审批</span>
            </t-radio-button>
          </t-radio-group>
        </t-form-item>

        <t-form-item v-if="createForm.mode === 'group'" label="房间名" name="name">
          <t-input
            v-model="createForm.name"
            placeholder="一起听点啥？（不填用默认名）"
            :maxlength="30"
            show-limit-number
          />
        </t-form-item>

        <t-form-item v-if="createForm.mode === 'group'" label="最大人数" name="maxMembers">
          <div class="slider-wrap">
            <t-slider
              v-model="createForm.maxMembers"
              :min="2"
              :max="50"
              :marks="{ 2: '2', 10: '10', 25: '25', 50: '50' }"
            />
          </div>
        </t-form-item>
      </t-form>

      <div class="lt-actions">
        <t-button theme="default" variant="outline" @click="close">取消</t-button>
        <t-button theme="primary" :loading="createSubmitting" @click="handleCreate">
          创建并进入
        </t-button>
      </div>
    </div>

    <!-- 加入表单 -->
    <div v-else class="lt-form">
      <t-form label-align="top" :disabled="joinSubmitting">
        <t-form-item label="口令 / 分享文案">
          <t-textarea
            ref="joinInputRef"
            v-model="joinInput"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="粘贴朋友发给你的口令，或者「一起听」开头的整段分享文案"
          />
        </t-form-item>
        <div v-if="detectedCode" class="lt-detected">
          <t-tag theme="success" variant="light">已识别口令：{{ detectedCode }}</t-tag>
        </div>
      </t-form>

      <div class="lt-actions">
        <t-button theme="default" variant="outline" @click="close">取消</t-button>
        <t-button theme="primary" :loading="joinSubmitting" @click="handleJoin">
          加入房间
        </t-button>
      </div>
    </div>
  </t-dialog>
</template>

<style scoped lang="scss">
/* 全局容器约束:确保表单内容(radio-group / slider 等)不会撑出 dialog 触发横向滚动 */
.lt-tabs,
.lt-form,
.mode-radio,
.slider-wrap {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.lt-tabs {
  margin-bottom: 16px;
  display: flex;
  :deep(.t-radio-button) {
    flex: 1;
    min-width: 0;
    text-align: center;
  }
}

.lt-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* form 内的元素若有较长文本不要撑出宽度 */
  :deep(.t-form__controls-content) {
    min-width: 0;
  }
}

/* 房间类型 radio-group:两个 button 平分宽,内部双行内容居中且能换行 */
.mode-radio {
  display: flex;
  :deep(.t-radio-button) {
    flex: 1;
    min-width: 0;
    height: auto;
    padding: 8px 12px;
    text-align: center;
    white-space: normal;
    line-height: 1.3;
  }
}

/* slider 容器:留 marks 标签的余地,防止 50 那一格的 "50" 文字溢出右侧 */
.slider-wrap {
  padding: 0 14px;
}

.mode-title {
  display: block;
  font-weight: 500;
}
.mode-desc {
  display: block;
  font-size: 12px;
  opacity: 0.7;
  margin-top: 2px;
}

.lt-detected {
  margin-top: -8px;
  margin-bottom: 8px;
}

.lt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
