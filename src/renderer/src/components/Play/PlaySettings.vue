<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { AdjustmentIcon, PaletteIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from '@renderer/plugin/notifications'
import { skinOptions, selectedSkin, selectSkin, regionOptions, overrides, selectRegion, regionNotices } from '@renderer/plugin/regions'
import type { PlayerRegion } from '@shiqianjiang/ceru-plugin-sdk'
import type { RegionChoice } from '@common/pluginSkin'
import { usePlaySettingStore } from '@renderer/store'
import { backgroundRenderers } from '@renderer/config/backgroundRenderers'
import PluginSkinSettings from './PluginSkinSettings.vue'
import SkinPreview from './SkinPreview.vue'

const playSetting = usePlaySettingStore()
const section = ref<'appearance' | 'playback'>('appearance')
const sectionViewport = ref<HTMLElement>()
let heightMotion: Animation | undefined
watch(section, async (_section, _previous, cleanup) => {
  const viewport = sectionViewport.value
  if (!viewport) return
  const from = viewport.offsetHeight
  heightMotion?.cancel()
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let stale = false
  cleanup(() => { stale = true })
  await nextTick()
  if (stale || !viewport.isConnected) return
  const to = viewport.offsetHeight
  if (from !== to) heightMotion = viewport.animate([{height:`${from}px`}, {height:`${to}px`}], {
    duration: 280, easing: 'cubic-bezier(.22,.68,.2,1)'
  })
})
onBeforeUnmount(() => heightMotion?.cancel())
function setSectionInert(element: Element, inert: boolean) { (element as HTMLElement).inert = inert }
function leaveSection(element: Element) {
  const pane = element as HTMLElement
  pane.style.setProperty('--leaving-height', `${pane.getBoundingClientRect().height}px`)
  setSectionInert(pane, true)
}
const mountedRegions = [
  { name:'player.lyrics', title:'歌词' }, { name:'player.artwork', title:'封面' }, { name:'player.background', title:'背景' },
  { name:'player.songInfo', title:'歌曲信息' }, { name:'player.visualizer', title:'频谱' }, { name:'player.stage', title:'全屏舞台' },
  { name:'desktopLyric', title:'桌面歌词' },
] as const
const choiceKey = (choice: RegionChoice) => JSON.stringify([choice.pluginId, choice.view])
function choiceValue(name: PlayerRegion) {
  const choice = overrides.value[name]
  return choice === undefined ? 'inherit' : choice === null ? 'default' : choiceKey(choice)
}
async function chooseRegion(name: PlayerRegion, event: Event) {
  const input = event.target as HTMLSelectElement, value = input.value
  try {
    const option = regionOptions.value.find(item => item.name === name && choiceKey(item) === value)
    if (!option && value !== 'default' && value !== 'inherit') throw Error('区域视图不可用')
    await selectRegion({ name, choice:option ? {pluginId:option.pluginId,view:option.view} : value === 'default' ? null : 'inherit' })
  } catch (error) { input.value = choiceValue(name); MessagePlugin.error(error instanceof Error ? error.message : '无法更新区域') }
}
async function chooseSkin(choice: {pluginId:string;skinId:string} | null, layout?: 'cd' | 'cover') {
  try {
    await selectSkin(choice)
    if (layout) playSetting.setLayoutMode(layout)
  } catch (error) { MessagePlugin.error(error instanceof Error ? error.message : '无法切换皮肤') }
}
const backgroundRenderer = computed({
  get: () => playSetting.getBackgroundRenderer,
  set: (value) => playSetting.setBackgroundRenderer(value)
})

// 设置配置项
const settingSections = computed(() => [
  {
    title: '界面设置',
    items: [
      {
        label: '显示左侧面板',
        value: playSetting.getShowLeftPanel,
        update: (val: boolean) => playSetting.setShowLeftPanel(val)
      },
      {
        label: '沉浸色歌词',
        value: playSetting.getIsImmersiveLyricColor,
        update: (val: boolean) => playSetting.setIsImmersiveLyricColor(val)
      },
      {
        label: '歌词模糊效果',
        value: playSetting.getIsBlurLyric,
        update: (val: boolean) => playSetting.setIsBlurLyric(val)
      },
      {
        label: '音频可视化',
        value: playSetting.getIsAudioVisualizer,
        update: (val: boolean) => playSetting.setIsAudioVisualizer(val)
      },
      {
        label: '自动隐藏控制栏',
        value: playSetting.getAutoHideBottom,
        update: (val: boolean) => playSetting.setAutoHideBottom(val)
      }
    ]
  },
  {
    title: '播放设置',
    items: [
      {
        label: '暂停播放过渡',
        value: playSetting.getIsPauseTransition,
        update: (val: boolean) => playSetting.setIsPauseTransition(val)
      },
      {
        label: '无感过渡(智能交叉淡化)',
        value: playSetting.getIsSeamlessTransition,
        update: (val: boolean) => playSetting.setIsSeamlessTransition(val)
      },
      {
        label: '使用 Apple 风格歌词',
        value: playSetting.getUseAmlLyricRenderer,
        update: (val: boolean) => playSetting.setUseAmlLyricRenderer(val)
      }
    ]
  },
  {
    title: '歌词设置',
    items: [
      {
        label: '显示音译',
        value: playSetting.getShowLyricRomanization,
        update: (val: boolean) => playSetting.setShowLyricRomanization(val)
      },
      {
        label: '跳转时逐行错开',
        value: playSetting.getIsSeekLyricStagger,
        update: (val: boolean) => playSetting.setIsSeekLyricStagger(val)
      },
      {
        label: '过滤歌词歌曲信息(下一首生效)',
        value: playSetting.getIsGrepLyricInfo,
        update: (val: boolean) => playSetting.setIsGrepLyricInfo(val)
      },
      {
        label: '严格过滤模式(可能误伤)',
        value: playSetting.getStrictGrep,
        update: (val: boolean) => playSetting.setStrictGrep(val)
      }
    ]
  }
])
</script>

<template>
  <div class="section-switch" role="radiogroup" aria-label="个性化分类">
    <label><input v-model="section" type="radio" name="personalization-section" value="appearance" /><PaletteIcon aria-hidden="true" /> 外观</label>
    <label><input v-model="section" type="radio" name="personalization-section" value="playback" /><AdjustmentIcon aria-hidden="true" /> 播放与歌词</label>
  </div>
  <div ref="sectionViewport" class="section-viewport" :class="{ backward: section === 'appearance' }">
  <Transition name="settings-section" @before-leave="leaveSection" @before-enter="setSectionInert($event, false)">
  <div :key="section" class="container" :data-section="section">
    <div v-if="regionNotices.length" class="health-list" aria-label="皮肤运行状态">
      <div v-for="item in regionNotices" :key="item.name" class="health-row" :class="{ 'region-warning': item.reason === 'warning' }">
        <span role="status">{{ mountedRegions.find(region => region.name === item.name)?.title }}：{{ item.reason === 'warning' ? '该皮肤可能影响流畅度' : item.reason === 'performance' ? '持续卡顿，已换回默认' : '出错已停用' }}</span>
        <button v-if="item.reason === 'warning'" type="button" @click="selectRegion({name:item.name,choice:null}).catch(() => MessagePlugin.error('无法更新区域'))">换回默认</button>
      </div>
    </div>
    <template v-if="section === 'appearance'">
    <div class="panel-header">播放器样式</div>
    <div class="style-cards">
      <button type="button"
        class="style-card"
        :aria-pressed="!selectedSkin && playSetting.getLayoutMode === 'cd'"
        :class="{ active: !selectedSkin && playSetting.getLayoutMode === 'cd' }"
        @click="chooseSkin(null, 'cd')"
      >
        <div class="card-preview cd-preview">
          <img src="../../assets/images/cd.png" alt="" />
        </div>
        <span>经典黑胶</span>
      </button>
      <button type="button"
        class="style-card"
        :aria-pressed="!selectedSkin && playSetting.getLayoutMode === 'cover'"
        :class="{ active: !selectedSkin && playSetting.getLayoutMode === 'cover' }"
        @click="chooseSkin(null, 'cover')"
      >
        <div class="card-preview cover-preview">
          <img src="../../assets/images/cover-play.png" alt="" />
        </div>

        <span>沉浸封面</span>
      </button>
      <button v-for="skin in skinOptions" :key="skin.pluginId + '/' + skin.skinId" type="button" class="style-card"
        :aria-pressed="selectedSkin?.pluginId === skin.pluginId && selectedSkin?.skinId === skin.skinId"
        :class="{ active: selectedSkin?.pluginId === skin.pluginId && selectedSkin?.skinId === skin.skinId }"
        @click="chooseSkin({ pluginId: skin.pluginId, skinId: skin.skinId })">
        <div class="card-preview plugin-preview"><SkinPreview :url="skin.previewUrl" /></div><span>{{ skin.title }}</span>
      </button>
    </div>

    <PluginSkinSettings />
    <details v-if="regionOptions.length || Object.keys(overrides).length" class="region-mixer">
      <summary>按区域选择</summary>
      <label v-for="region in mountedRegions" :key="region.name" class="control-row">
        <span>{{ region.title }}</span>
        <select :aria-label="region.title + '区域'" :value="choiceValue(region.name)" @change="chooseRegion(region.name, $event)">
          <option value="inherit">跟随整套皮肤</option>
          <option value="default">系统默认</option>
          <option v-if="overrides[region.name] && !regionOptions.some(item => item.name === region.name && choiceKey(item) === choiceValue(region.name))" :value="choiceValue(region.name)" disabled>所选插件不可用</option>
          <option v-for="item in regionOptions.filter(item => item.name === region.name)" :key="choiceKey(item)" :value="choiceKey(item)">{{ item.title }} · {{ item.view }}</option>
        </select>
      </label>
    </details>
    <div class="panel-header">背景设置</div>
    <div class="renderer-select">
      <span class="renderer-title">背景渲染器</span>
      <div class="renderer-options" role="radiogroup" aria-label="背景渲染器">
        <t-popup
          v-for="renderer in backgroundRenderers"
          :key="renderer.value"
          trigger="hover"
          placement="top"
          :delay="[800, 120]"
          :show-arrow="false"
          destroy-on-close
          overlay-inner-class-name="renderer-info-popup"
        >
          <label class="renderer-option" :class="{ active: backgroundRenderer === renderer.value }">
            <input
              v-model="backgroundRenderer"
              type="radio"
              name="background-renderer"
              :value="renderer.value"
              :aria-label="`${renderer.label} ${renderer.name}`"
              :aria-describedby="`renderer-description-${renderer.value}`"
            />
            <span class="renderer-name">{{ renderer.name }}</span>
          </label>
          <template #content>
            <div
              :id="`renderer-description-${renderer.value}`"
              class="renderer-description"
              role="tooltip"
            >
              <div class="renderer-description-header">
                <strong>{{ renderer.label }}</strong>
                <span class="renderer-beat-badge" :class="{ supported: renderer.supportsBeat }">
                  {{ renderer.supportsBeat ? '支持鼓点' : '不支持鼓点' }}
                </span>
              </div>
              <div class="renderer-description-name">{{ renderer.fullName }}</div>
              <p>{{ renderer.description }}</p>
              <div class="renderer-description-detail">{{ renderer.detail }}</div>
            </div>
          </template>
        </t-popup>
      </div>
    </div>
    <Transition name="settings-reveal" @before-leave="setSectionInert($event, true)" @before-enter="setSectionInert($event, false)">
    <div v-if="playSetting.getBackgroundSupportsBeat" class="beat-settings-reveal">
    <div class="control-row">
      <span>背景鼓点效果</span>
      <t-switch
        :value="playSetting.getIsBackgroundBeat"
        @update:value="playSetting.setIsBackgroundBeat"
      />
    </div>
    </div>
    </Transition>

    </template>
    <template v-else v-for="group in settingSections" :key="group.title">
      <div class="panel-header">{{ group.title }}</div>
      <div v-for="item in group.items" :key="item.label" class="control-row">
        <span>{{ item.label }}</span>
        <t-switch :aria-label="item.label" :value="item.value" @update:value="item.update" />
      </div>
    </template>
  </div>
  </Transition>
  </div>
</template>

<style lang="scss" scoped>
.section-switch {
  flex: none; display: flex; gap: 18px; margin: 0 20px; border-bottom: 1px solid rgb(255 255 255 / 12%);
  label { position: relative; display: flex; align-items: center; gap: 6px; padding: 9px 2px; border-bottom: 2px solid transparent; color: rgb(255 255 255 / 75%); font-size: 13px; cursor: pointer; }
  label:has(:checked) { border-color: var(--skin-tint, white); color: white; }
  label:has(:focus-visible) { outline: 2px solid #c4e8dc; outline-offset: -2px; }
  input { position: absolute; opacity: 0; width: 1px; height: 1px; }
}
.section-viewport {
  --section-offset: 10px;
  position: relative; display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  &.backward { --section-offset: -10px; }
}
.settings-section-enter-active { transition: opacity 320ms ease-out, transform 320ms ease-out; }
.settings-section-leave-active {
  position: absolute; inset: 0 0 auto; box-sizing: border-box; height: var(--leaving-height); pointer-events: none;
  transition: opacity 150ms ease-in, transform 180ms ease-in;
}
.settings-section-enter-from { opacity: 0; transform: translateX(var(--section-offset)); }
.settings-section-leave-to { opacity: 0; transform: translateX(calc(-1 * var(--section-offset))); }
@media (prefers-reduced-motion: no-preference) {
  .settings-section-enter-active :is(.panel-header, .style-card, .control-row, .renderer-select, .region-mixer, .skin-settings-reveal, .health-list),
  .settings-section-leave-active :is(.panel-header, .style-card, .control-row, .renderer-select, .region-mixer, .skin-settings-reveal, .health-list) {
    transition: opacity 130ms ease-in, translate 150ms ease-in;
  }
  .settings-section-enter-active :is(.panel-header, .style-card, .control-row, .renderer-select, .region-mixer, .skin-settings-reveal, .health-list) {
    transition: opacity 220ms ease-out, translate 240ms cubic-bezier(.22,.68,.2,1);
    transition-delay: 24ms;
  }
  .settings-section-enter-active :is(.style-card:nth-child(even), .control-row:nth-child(odd), .renderer-select, .region-mixer) {
    transition-delay: 62ms;
  }
  .settings-section-enter-from :is(.panel-header, .style-card, .control-row, .renderer-select, .region-mixer, .skin-settings-reveal, .health-list) {
    opacity: 0; translate: 0 7px;
  }
  .settings-section-leave-to :is(.panel-header, .style-card, .control-row, .renderer-select, .region-mixer, .skin-settings-reveal, .health-list) {
    opacity: 0; translate: 0 -4px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .settings-section-enter-active, .settings-section-leave-active { transition: none; }
  .settings-section-enter-from, .settings-section-leave-to { transform: none; }
}
.container {
  min-height: 0; overflow: auto; overscroll-behavior: contain;
  padding: 16px 20px 20px; scrollbar-width: thin; scrollbar-color: rgb(255 255 255 / 25%) transparent;
}
.panel-header, .region-mixer summary {
  margin: 0 0 12px; font-size: 15px; line-height: 20px; font-weight: 600; color: rgb(255 255 255 / 95%);
}
.panel-header:not(:first-child) { margin-top: 18px; padding-top: 12px; border-top: 1px solid rgb(255 255 255 / 10%); }
.region-mixer { margin-top: 14px; }
.region-mixer summary { cursor: pointer; }
@media (prefers-reduced-motion: no-preference) {
  .region-mixer::details-content {
    interpolate-size: allow-keywords; block-size: 0; opacity: 0; overflow: clip;
    transition: block-size 260ms cubic-bezier(.22,.68,.2,1), opacity 200ms ease, content-visibility 260ms allow-discrete;
  }
  .region-mixer[open]::details-content { block-size: auto; opacity: 1; }
}
.region-mixer select { max-width: 66%; min-width: 0; padding: 4px 8px; font: inherit; color: inherit; background: #323536; border: 1px solid #535758; border-radius: 5px; }
.style-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.style-card {
  min-width: 0; display: flex; flex-direction: column; align-items: stretch; gap: 12px; padding: 14px;
  border: 2px solid transparent; border-radius: 16px; color: inherit;
  background: rgb(255 255 255 / 5%); text-align: center; font: inherit; font-size: 14px; cursor: pointer;
  transition: background-color 200ms ease, border-color 200ms ease;
  &:hover { background: rgb(255 255 255 / 10%); }
  &.active { background: rgb(255 255 255 / 15%); border-color: var(--skin-tint, white); box-shadow: 0 8px 20px -5px rgb(0 0 0 / 30%); }
  &:focus-visible { outline: 2px solid #c4e8dc; outline-offset: 1px; }
  span { min-width: 0; overflow-wrap: anywhere; }
}
.card-preview {
  aspect-ratio: 3 / 2; display: grid; place-items: center; overflow: hidden; padding: 8px; border-radius: 10px; background: rgb(0 0 0 / 20%);
  img { display: block; width: 100%; height: 100%; object-fit: contain; }
}
.plugin-preview { color: var(--skin-tint, white); }
.control-row, .health-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 32px; font-size: 13px; line-height: 1.5;
}
.health-list { margin-bottom: 14px; padding: 4px 10px; border-left: 2px solid #dfb676; background: rgb(223 182 118 / 8%); }
.health-row { color: #efdab8; font-size: 12px; }
.health-row button { flex: none; color: inherit; background: transparent; cursor: pointer; border: none; text-decoration: underline; }

.renderer-select {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  min-width: 0;
  padding: 8px 8px 12px;
  font-size: 14px;

  .renderer-title {
    flex-shrink: 0;
    color: rgba(241, 241, 241, 0.8);
  }
}

.renderer-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  gap: 3px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.1);
}

.renderer-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 32px;
  box-sizing: border-box;
  padding: 6px 2px;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.09);
  }

  &.active {
    background: rgba(255, 255, 255, 0.18);
    .renderer-name {
      color: rgba(255, 255, 255, 0.95);
    }
  }

  &:has(input:focus-visible) {
    outline: 2px solid rgba(255, 255, 255, 0.9);
    outline-offset: 3px;
  }

  .renderer-name {
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    line-height: 16px;
    white-space: nowrap;
  }
}

@container (max-width: 260px) {
  .renderer-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

<style>
@media (prefers-reduced-motion: no-preference) {
  .section-viewport .settings-reveal-enter-active, .section-viewport .settings-reveal-leave-active {
    interpolate-size: allow-keywords; block-size: auto; overflow: clip;
    transition: block-size 260ms cubic-bezier(.22,.68,.2,1), opacity 220ms ease;
  }
  .section-viewport .settings-reveal-enter-from, .section-viewport .settings-reveal-leave-to { block-size: 0; opacity: 0; }
}
</style>

<!-- 提示浮层挂载到 body，避免被设置面板的滚动区域裁切。 -->
<style lang="scss">
.t-popup__content.renderer-info-popup {
  width: 292px;
  max-width: calc(100vw - 32px);
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(30, 28, 38, 0.88);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.25);
  user-select: none;

  .renderer-description-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
  }

  .renderer-beat-badge {
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.55);
    font-size: 11px;
    line-height: 18px;
    white-space: nowrap;

    &.supported {
      background: rgba(140, 205, 177, 0.12);
      color: #b7ddcb;
    }
  }

  .renderer-description-name {
    margin-top: 3px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 11px;
  }

  p {
    margin: 12px 0;
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    line-height: 1.7;
  }

  .renderer-description-detail {
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    line-height: 1.6;
  }
}
</style>
