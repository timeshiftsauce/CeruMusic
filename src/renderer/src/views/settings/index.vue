<script setup lang="ts">
import { ref, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import type { DropdownMenuProps, DropdownOption } from 'naive-ui'
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import {
  PaletteIcon, ApiIcon, PlayCircleIcon, KeyboardIcon, TreeRoundDotIcon,
  MusicIcon, SaveIcon, InternetIcon, InfoCircleIcon, SystemSettingIcon, ChevronDownIcon
} from 'tdesign-icons-vue-next'
import AppearanceSection from './sections/AppearanceSection.vue'
import AISection from './sections/AISection.vue'
import PlaybackSection from './sections/PlaybackSection.vue'
import LyricsSection from './sections/LyricsSection.vue'
import SystemSection from './sections/SystemSection.vue'
import HotkeySection from './sections/HotkeySection.vue'
import PluginSection from './sections/PluginSection.vue'
import MusicSourceSection from './sections/MusicSourceSection.vue'
import StorageSection from './sections/StorageSection.vue'
import NetworkSection from './sections/NetworkSection.vue'
import AboutSection from './sections/AboutSection.vue'
import SettingsSearch from '@renderer/components/SettingsSearch.vue'
import { searchItems, type SearchItem } from './searchIndex'
import { settingsCategories, settingsGroups, resolveSettingsCategory, type SettingsCategoryKey } from './categories'

const activeCategory = ref<SettingsCategoryKey>('appearance')
const route = useRoute()
const contentPanelRef = ref<HTMLElement>()
const scrollPositions: Record<string, number> = {}
const categoryIcons = {
  appearance: PaletteIcon, playlist: PlayCircleIcon, lyrics: MusicIcon,
  hotkeys: KeyboardIcon, music: MusicIcon, plugins: TreeRoundDotIcon,
  ai: ApiIcon, storage: SaveIcon, network: InternetIcon,
  system: SystemSettingIcon, about: InfoCircleIcon
}
const navigationGroups = settingsGroups.map((group) => ({
  ...group,
  categories: settingsCategories.filter((category) => category.group === group.key)
}))
const sectionComponents = {
  appearance: AppearanceSection, ai: AISection, playlist: PlaybackSection,
  lyrics: LyricsSection, system: SystemSection, hotkeys: HotkeySection,
  plugins: PluginSection, music: MusicSourceSection, storage: StorageSection,
  network: NetworkSection, about: AboutSection
}
const currentCategory = computed(() =>
  settingsCategories.find((item) => item.key === activeCategory.value) || settingsCategories[0]
)
const currentComponent = computed(() => sectionComponents[activeCategory.value])
const sectionLinks = computed(() => searchItems.filter((item) =>
  item.category === activeCategory.value &&
  (item.id !== 'appearance-mac-status-lyric' || /mac/i.test(navigator.platform || navigator.userAgent))
))

let navigationVersion = 0
let scrollTimer: ReturnType<typeof setTimeout> | undefined
let highlightTimer: ReturnType<typeof setTimeout> | undefined
let highlightedElement: HTMLElement | undefined
function cancelPendingScroll() {
  clearTimeout(scrollTimer)
  clearTimeout(highlightTimer)
  highlightedElement?.classList.remove('highlight-flash')
  highlightedElement = undefined
}
const switchCategory = async (categoryKey: string) => {
  const key = resolveSettingsCategory(categoryKey)
  if (!key || activeCategory.value === key) return
  cancelPendingScroll()
  const version = ++navigationVersion
  if (contentPanelRef.value) scrollPositions[activeCategory.value] = contentPanelRef.value.scrollTop
  activeCategory.value = key
  await nextTick()
  if (version === navigationVersion && contentPanelRef.value) {
    contentPanelRef.value.scrollTop = scrollPositions[key] || 0
  }
}
const sectionDropdownOptions = computed<DropdownOption[]>(() =>
  sectionLinks.value.map((item) => ({ label: item.title, key: item.id }))
)
const sectionMenuProps: DropdownMenuProps = () => ({
  style: 'max-height: 320px; overflow-y: auto'
})
function handleSectionSelect(key: string | number) {
  scrollToSection(String(key))
}
function scrollToSection(sectionId?: string) {
  cancelPendingScroll()
  if (!sectionId) return
  const version = navigationVersion
  let attempts = 0
  const tryScroll = () => {
    if (version !== navigationVersion) return
    const panel = contentPanelRef.value
    const element = document.getElementById(sectionId)
    if (element && panel?.contains(element)) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      panel.scrollTo({
        top: panel.scrollTop + element.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16,
        behavior: reducedMotion ? 'auto' : 'smooth'
      })
      element.classList.add('highlight-flash')
      highlightedElement = element
      highlightTimer = setTimeout(() => element.classList.remove('highlight-flash'), 2000)
    } else if (++attempts < 20) {
      scrollTimer = setTimeout(tryScroll, 100)
    }
  }
  tryScroll()
}
watch(() => route.query, async (query) => {
  const section = typeof query.section === 'string' ? query.section : ''
  const category = resolveSettingsCategory(String(query.category || ''), section)
  if (category) await switchCategory(category)
  if (section) {
    await nextTick()
    scrollToSection(section)
  }
}, { immediate: true, deep: true })
const handleSearchSelect = async (item: SearchItem) => {
  await switchCategory(item.category)
  await nextTick()
  scrollToSection(item.id)
}
onBeforeUnmount(cancelPendingScroll)
</script>

<template>
  <div class="main-container">
    <div class="header" data-app-titlebar>
      <TitleBarControls title="设置" :show-back="true" :show-account="false">
        <template #extra>
          <SettingsSearch @select="handleSearchSelect" />
        </template>
      </TitleBarControls>
    </div>
    <div class="settings-layout">
      <aside class="sidebar">
        <div class="sidebar-heading">偏好设置</div>
        <nav class="sidebar-nav" aria-label="设置分类">
          <div v-for="group in navigationGroups" :key="group.key" class="nav-group">
            <div class="nav-group-label">{{ group.label }}</div>
            <button
              v-for="category in group.categories"
              :id="`settings-nav-${category.key}`"
              :key="category.key"
              type="button"
              class="nav-item"
              :class="{ active: activeCategory === category.key }"
              :aria-current="activeCategory === category.key ? 'page' : undefined"
              :title="category.description"
              @click="switchCategory(category.key)"
            >
              <component :is="categoryIcons[category.key]" class="nav-icon" aria-hidden="true" />
              <span>{{ category.label }}</span>
              <span v-if="activeCategory === category.key" class="active-dot" aria-hidden="true"></span>
            </button>
          </div>
        </nav>
      </aside>
      <main class="content-panel" aria-label="设置内容">
        <div class="page-heading">
          <div class="page-heading-copy">
            <h1>{{ currentCategory.label }}</h1>
            <p>{{ currentCategory.description }}</p>
          </div>
          <n-dropdown
            v-if="sectionLinks.length > 1 && activeCategory !== 'plugins'"
            trigger="click"
            placement="bottom-end"
            :options="sectionDropdownOptions"
            :key="activeCategory"
            :menu-props="sectionMenuProps"
            @select="handleSectionSelect"
          >
            <n-button class="section-jump" secondary icon-placement="right">
              本页目录
              <template #icon><ChevronDownIcon aria-hidden="true" /></template>
            </n-button>
          </n-dropdown>
        </div>
        <div ref="contentPanelRef" class="panel-content" :class="{ 'panel-content-contained': activeCategory === 'plugins' }">
          <div class="section-container" :class="{ 'section-container-wide': activeCategory === 'plugins' }">
            <KeepAlive>
              <component :is="currentComponent" :key="activeCategory" @switch-category="switchCategory" />
            </KeepAlive>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.main-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--settings-text-primary);
  background: var(--settings-main-bg);
}
.header {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  padding: 1.5rem;
  flex-shrink: 0;
  background: var(--settings-header-bg);
  border-bottom: 1px solid var(--settings-group-border);
  z-index: 1000;
}
.settings-layout { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.sidebar {
  width: 236px;
  box-sizing: border-box;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 26px 14px;
  background: var(--settings-sidebar-bg);
  border-right: 1px solid var(--settings-group-border);
}
.sidebar-heading {
  padding: 2px 12px 20px;
  color: var(--settings-text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.nav-group + .nav-group { margin-top: 20px; }
.nav-group-label {
  padding: 0 12px 8px;
  color: var(--settings-text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.nav-item {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 40px;
  padding: 9px 12px;
  margin: 3px 0;
  border: 1px solid transparent;
  border-radius: 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  color: var(--settings-nav-label-color);
  background: transparent;
  cursor: pointer;
  transition: background-color 0.16s, color 0.16s, border-color 0.16s, transform 0.16s;
  &:hover {
    background: var(--settings-nav-hover-bg);
    transform: translateX(2px);
  }
  &.active {
    border-color: color-mix(in srgb, var(--td-brand-color) 16%, transparent);
    background: color-mix(in srgb, var(--td-brand-color) 10%, transparent);
    color: var(--td-brand-color);
    font-weight: 650;
  }
}
.nav-icon { flex-shrink: 0; width: 18px; height: 18px; opacity: 0.78; }
.nav-item.active .nav-icon { opacity: 1; }
.active-dot { margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.content-panel { min-width: 0; min-height: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--settings-main-bg); }
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-shrink: 0;
  padding: 32px max(40px, calc((100% - 960px) / 2)) 20px;
}
.page-heading-copy { min-width: 0; }
h1 {
  margin: 0;
  color: var(--settings-text-primary);
  font-size: 27px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.035em;
}
.page-heading p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--settings-text-secondary);
}
.section-jump { flex-shrink: 0; }
.panel-content { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 40px 40px; scrollbar-gutter: stable both-edges; }
.section-container { max-width: 960px; margin: 0 auto; }
.panel-content.panel-content-contained { overflow: hidden; display: flex; flex-direction: column; padding-top: 4px; scrollbar-gutter: auto; }
.section-container-wide { width: 100%; flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sidebar, .panel-content {
  scrollbar-width: thin;
  scrollbar-color: var(--settings-group-border) transparent;
}
button:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
// 仅统一设置页一级卡片，保留各设置组件内部的交互布局。
.section-container :deep(.settings-section) { animation: none; }
.section-container :deep(.settings-section > .setting-group),
.section-container :deep(.settings-section > .setting-card) {
  border: 1px solid color-mix(in srgb, var(--settings-group-border) 65%, transparent);
  border-radius: 12px;
  box-shadow: none;
  animation: none;
  background: var(--settings-group-bg);
}
.section-container :deep(.settings-section > .setting-group) { padding: 24px; margin-bottom: 16px; }
.section-container :deep(.settings-section > .setting-card > .t-card__header) { padding: 20px 24px 0; border: 0; }
.section-container :deep(.settings-section > .setting-card > .t-card__body) { padding: 20px 24px 24px; }
.section-container :deep(.settings-section > .setting-card .t-card__title) { font-size: 16px; font-weight: 600; }
.section-container :deep(.setting-spacer) { height: 16px; }
.section-container :deep(.settings-section > .setting-group > h3) { font-size: 16px; line-height: 1.5; margin: 0 0 18px; }
.section-container :deep(.setting-item) { gap: 20px; }
.section-container :deep(.setting-item > .item-info) { min-width: 0; }
.section-container :deep(.setting-item > .t-switch) { flex-shrink: 0; }
.section-container :deep(.item-desc) { line-height: 1.6; }
.section-container :deep([id]) { scroll-margin-top: 16px; }
:deep(.highlight-flash) { outline: 2px solid var(--td-brand-color); outline-offset: 3px; }
@media (max-width: 1100px) {
  .sidebar { width: 190px; padding: 20px 8px; }
  .page-heading { padding: 24px 24px 18px; }
  .panel-content { padding: 20px 24px 32px; }
}
@media (max-width: 760px) {
  .settings-layout { flex-direction: column; }
  .sidebar { width: auto; padding: 8px 12px; border-right: 0; border-bottom: 1px solid var(--settings-group-border); overflow-x: auto; flex-shrink: 0; }
  .sidebar-heading, .nav-group-label { display: none; }
  .sidebar-nav, .nav-group { display: flex; gap: 4px; }
  .nav-group + .nav-group { margin: 0; padding-left: 8px; border-left: 1px solid var(--settings-group-border); }
  .nav-item { width: auto; white-space: nowrap; min-height: 38px; }
  .active-dot { display: none; }
  .page-heading { padding: 18px 18px 14px; }
  h1 { font-size: 22px; }
  .panel-content { padding: 16px 16px 28px; }
  .panel-content-contained { padding-inline: 18px; }
  .section-container :deep(.settings-section > .setting-group) { padding: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .nav-item { transition: none; }
}
</style>
