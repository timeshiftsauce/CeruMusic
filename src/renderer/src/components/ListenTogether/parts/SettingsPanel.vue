<script setup lang="ts">
/**
 * 一起听设置面板 —— ListenTogetherOverlay 的子视图
 *
 * 通过 ListenTogetherOverlay 自维护的"子视图路由"渲染(非 vue-router),
 * 切换时走 <Transition> 左右滑动动画。
 *
 * 设置项分组:
 *  - 通知:系统通知 / 软件内通知 / @ 强提示
 *  - 弹幕:开关 / 字体大小 / 速度
 *
 * 字段都直接挂在 listenTogetherSettings store 上(persist 持久化),改完即刻生效:
 *  - notifier.ts 通过 store getter 实时读
 *  - LtDanmakuLayer 监听 store 变更
 *  - LtChatToast 监听 store 变更
 */
import { computed } from 'vue'
import { ChevronLeftIcon } from 'tdesign-icons-vue-next'
import {
  Switch as TSwitch,
  RadioGroup as TRadioGroup,
  RadioButton as TRadioButton
} from 'tdesign-vue-next'
import {
  useListenTogetherSettingsStore,
  type DanmakuFontScale,
  type DanmakuSpeed
} from '@renderer/store/ListenTogetherSettings'

const emit = defineEmits<{ (e: 'back'): void }>()

const settings = useListenTogetherSettingsStore()

/* 弹幕字体档位 —— 文案展示用,值是 store 类型 */
const fontScaleOptions = computed<{ label: string; value: DanmakuFontScale }[]>(() => [
  { label: '小', value: 0.8 },
  { label: '标准', value: 1.0 },
  { label: '大', value: 1.2 },
  { label: '特大', value: 1.5 }
])

/* 弹幕速度档位 —— 数值越大越快(对应 LtDanmakuLayer 内 duration / speed) */
const speedOptions = computed<{ label: string; value: DanmakuSpeed }[]>(() => [
  { label: '极慢', value: 0.6 },
  { label: '慢', value: 0.8 },
  { label: '标准', value: 1.0 },
  { label: '快', value: 1.3 },
  { label: '极快', value: 1.6 }
])
</script>

<template>
  <div class="lt-settings">
    <div class="lt-settings-head">
      <button class="back-btn" title="返回" @click="emit('back')">
        <ChevronLeftIcon size="20" />
        <span>设置</span>
      </button>
      <button class="reset-btn" title="恢复默认" @click="settings.resetAll">恢复默认</button>
    </div>

    <div class="lt-settings-body">
      <!-- 通知 -->
      <section class="group">
        <h3 class="group-title">通知</h3>
        <p class="group-hint">控制收到聊天消息时的提醒方式。</p>

        <div class="item">
          <div class="item-info">
            <div class="item-label">系统通知</div>
            <div class="item-desc">软件失焦时,通过操作系统通知中心提示新消息</div>
          </div>
          <TSwitch
            :model-value="settings.enableSystemNotify"
            @update:model-value="settings.setEnableSystemNotify(Boolean($event))"
          />
        </div>

        <div class="item">
          <div class="item-info">
            <div class="item-label">软件内通知</div>
            <div class="item-desc">未展开播放器或一起听面板时,右下角弹卡片</div>
          </div>
          <TSwitch
            :model-value="settings.enableInAppNotify"
            @update:model-value="settings.setEnableInAppNotify(Boolean($event))"
          />
        </div>

        <div class="item">
          <div class="item-info">
            <div class="item-label">@ 我时强提示</div>
            <div class="item-desc">被 @ 的消息绕过节流并保持通知,直到手动关闭</div>
          </div>
          <TSwitch
            :model-value="settings.enableMentionStrong"
            @update:model-value="settings.setEnableMentionStrong(Boolean($event))"
          />
        </div>
      </section>

      <!-- 弹幕 -->
      <section class="group">
        <h3 class="group-title">弹幕</h3>
        <p class="group-hint">全屏播放器中聊天弹幕的显示效果。</p>

        <div class="item">
          <div class="item-info">
            <div class="item-label">开启弹幕</div>
            <div class="item-desc">关闭后,聊天消息将不会以弹幕形式飘过播放界面</div>
          </div>
          <TSwitch
            :model-value="settings.enableDanmaku"
            @update:model-value="settings.setEnableDanmaku(Boolean($event))"
          />
        </div>

        <div class="item column" :class="{ disabled: !settings.enableDanmaku }">
          <div class="item-info">
            <div class="item-label">弹幕字号</div>
            <div class="item-desc">影响弹幕基础大小,会与随机微抖动叠加</div>
          </div>
          <TRadioGroup
            :model-value="settings.danmakuFontScale"
            :disabled="!settings.enableDanmaku"
            variant="default-filled"
            @update:model-value="settings.setDanmakuFontScale($event as DanmakuFontScale)"
          >
            <TRadioButton v-for="opt in fontScaleOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </TRadioButton>
          </TRadioGroup>
        </div>

        <div class="item column" :class="{ disabled: !settings.enableDanmaku }">
          <div class="item-info">
            <div class="item-label">弹幕速度</div>
            <div class="item-desc">值越大,弹幕飘过屏幕越快</div>
          </div>
          <TRadioGroup
            :model-value="settings.danmakuSpeed"
            :disabled="!settings.enableDanmaku"
            variant="default-filled"
            @update:model-value="settings.setDanmakuSpeed($event as DanmakuSpeed)"
          >
            <TRadioButton v-for="opt in speedOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </TRadioButton>
          </TRadioGroup>
        </div>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.lt-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  color: rgba(255, 255, 255, 0.92);
}

.lt-settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.95);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px 4px 0;
  border-radius: 8px;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.8;
  }
}

.reset-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition:
    background 0.15s,
    color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.95);
  }
}

.lt-settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 24px 24px;
  /* 与 ChatPanel/全屏播放列表保持一致:8px 宽,半透明白 thumb,无 track */
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

.group {
  margin-top: 16px;
  padding: 14px 16px 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;

  &:first-child {
    margin-top: 4px;
  }
}

.group-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: 0.5px;
}

.group-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.05);

  &:first-of-type {
    border-top: none;
  }

  &.column {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  &.disabled {
    opacity: 0.45;
    pointer-events: auto; /* radio group 内部已有 disabled */
  }
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
}

.item-desc {
  margin-top: 2px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
}

/* tdesign default-filled RadioGroup 适配深色玻璃
 *
 * tdesign 实现机制(看 dist/tdesign.css 的 .t-radio-group--filled 这套):
 *   .t-radio-group(容器) > .t-radio-group__bg-block(滑块,绝对定位,选中时移动)
 *                       > .t-radio-button × N(透明文字按钮)
 *
 * 选中视觉来自 __bg-block 这个滑块,不是某个 button 自身的背景。
 * 因此自定义时:
 *  - 不要给 .t-radio-button 加 background,否则会和滑块叠 → 出现"白色色块",
 *    且滑块圆角和我们手设的圆角一旦不一致就难看
 *  - 只调:容器圆角、滑块颜色/圆角(对齐容器内边距)、未选中字色、选中字色
 *  - 选中字色用深色 (#0b1220) 在主题色上获得最高对比度,符合 anti 文字语义
 */
:deep(.t-radio-group) {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 2px;
}

/* 滑块 —— 圆角比容器小 2px(刚好等于 padding),
 * 视觉上和容器圆心同心,两端切齐不漏白边 */
:deep(.t-radio-group__bg-block) {
  background-color: var(--td-brand-color-5, rgba(255, 255, 255, 0.85)) !important;
  border-radius: 6px !important;
  box-shadow: 0 0 8px var(--td-brand-color-5, rgba(255, 255, 255, 0.3));
}

/* 未选中字色 —— 白 92% 在深玻璃背景下足够对比度 */
:deep(.t-radio-button),
:deep(.t-radio-button .t-radio-button__label),
:deep(.t-radio-button label),
:deep(.t-radio-button span) {
  background: transparent !important;
  border: none !important;
  color: rgba(255, 255, 255, 0.92) !important;
  font-size: 12px;
}

:deep(.t-radio-button:hover),
:deep(.t-radio-button:hover .t-radio-button__label),
:deep(.t-radio-button:hover span) {
  color: #fff !important;
}

/* 选中字色 —— 滑块底色是主题色(通常较亮),用深色文字保证 4.5:1 以上对比度
 * 不直接用纯黑 #000,而是用 #0b1220(略蓝深),配主题色更柔和 */
:deep(.t-radio-button.t-is-checked),
:deep(.t-radio-button.t-is-checked .t-radio-button__label),
:deep(.t-radio-button.t-is-checked span),
:deep(.t-radio-button.t-is-checked label) {
  // color: #0b1220 !important;
  font-weight: 600;
}

/* 分隔细线(:before)在选中相邻时官方会淡化,
 * 深色玻璃下颜色太突兀,统一压暗 */
:deep(.t-radio-group--filled .t-radio-button::before),
:deep(.t-radio-group .t-radio-button::before) {
  background-color: rgba(255, 255, 255, 0.1) !important;
}

/* 禁用态(关闭弹幕时)字色压到 0.45 白,
 * 滑块如果还在选中位置,把它也降到中性灰避免突兀的主题色亮块 */
:deep(.t-radio-button.t-is-disabled),
:deep(.t-radio-button.t-is-disabled .t-radio-button__label),
:deep(.t-radio-button.t-is-disabled span) {
  color: rgba(255, 255, 255, 0.45) !important;
}
:deep(.t-radio-button.t-is-disabled.t-is-checked) {
  color: rgba(20, 20, 20, 0.65) !important;
}
:deep(.t-radio-button.t-is-disabled.t-is-checked ~ .t-radio-group__bg-block) {
  background-color: rgba(255, 255, 255, 0.35) !important;
  box-shadow: none;
}
</style>
