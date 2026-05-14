<script setup lang="ts">
/**
 * LyricCopyOverlay —— 歌词复制浮层
 *
 * 整体样式刻意对齐 `CommentsOverlay.vue` 和 `ListenTogetherOverlay.vue`:
 *   - Teleport 到 body
 *   - 全屏 backdrop + 居中卡片 (而不是 t-dialog,以便和"评论"、"一起听"两个浮层
 *     视觉上完全一致,沉浸感更强)
 *   - 顶部 header + 工具栏 + 可滚动列表 + 底部操作栏
 *
 * 功能:
 *   - 多选行(checkbox)
 *   - 全选 / 反选
 *   - 含翻译开关 / 含罗马音开关 / 含时间戳开关
 *   - 复制选中(默认全选) / 一键全选 / 清空选择
 *
 * 数据源是父组件传入的 `lyricLines`(就是 `player.lyrics.lines`,
 * `@applemusic-like-lyrics/core` 的 `LyricLine` 数组)。
 * 重要:这里不依赖 LyricLine 的内部字段,只做组合,所以 yrc/qrc/lrc 三种格式都兼容。
 */
import { ref, computed, watch } from 'vue'
import { CloseIcon, CopyIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import type { LyricLine } from '@applemusic-like-lyrics/core'

const props = withDefaults(
  defineProps<{
    show: boolean
    lyricLines: LyricLine[]
    mainColor?: string
    songTitle?: string
    artist?: string
  }>(),
  {
    mainColor: 'var(--td-brand-color)',
    songTitle: '',
    artist: ''
  }
)

const emit = defineEmits(['close'])

// ---- 选项 ----
const includeTranslation = ref(true)
const includeRomaji = ref(false)
const includeTimestamp = ref(false)

// ---- 选中集 —— 用 Set<number> 存储索引 ----
const selected = ref<Set<number>>(new Set())

// 把一行 LyricLine 拼成纯文本(忽略空 word)
const lineText = (line: LyricLine): string => {
  if (!line || !Array.isArray(line.words)) return ''
  return line.words
    .map((w) => (w?.word ?? '').toString())
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

// 时间戳格式化:ms -> [mm:ss.xx]
const formatTs = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const totalCs = Math.floor(ms / 10)
  const cs = totalCs % 100
  const totalSec = Math.floor(totalCs / 100)
  const sec = totalSec % 60
  const min = Math.floor(totalSec / 60)
  return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`
}

// 派生:可见行(过滤掉完全空的间奏行,这些行复制出去也没意义)
const visibleLines = computed(() => {
  return (props.lyricLines || []).map((line, idx) => {
    const main = lineText(line)
    return {
      idx,
      main,
      // LyricLine 的 translatedLyric / romanLyric 是可选字段
      translation: (line as any)?.translatedLyric || '',
      romaji: (line as any)?.romanLyric || '',
      startTime: (line as any)?.startTime ?? 0,
      hasContent: main.length > 0
    }
  })
})

// 真正可勾选的(有歌词内容的)行
const selectableIndices = computed(() =>
  visibleLines.value.filter((l) => l.hasContent).map((l) => l.idx)
)

const allSelected = computed(
  () =>
    selectableIndices.value.length > 0 &&
    selectableIndices.value.every((i) => selected.value.has(i))
)

const someSelected = computed(
  () => selectableIndices.value.some((i) => selected.value.has(i)) && !allSelected.value
)

const selectedCount = computed(
  () => selectableIndices.value.filter((i) => selected.value.has(i)).length
)

// 默认:面板打开时全选(用户最常见的需求是"复制整首歌词")
watch(
  () => props.show,
  (v) => {
    if (v) {
      const next = new Set<number>()
      for (const i of selectableIndices.value) next.add(i)
      selected.value = next
    }
  },
  { immediate: true }
)

// 行数变化(切歌)时也重置一次
watch(
  () => props.lyricLines,
  () => {
    if (!props.show) return
    const next = new Set<number>()
    for (const i of selectableIndices.value) next.add(i)
    selected.value = next
  }
)

const toggleLine = (idx: number): void => {
  if (selected.value.has(idx)) selected.value.delete(idx)
  else selected.value.add(idx)
  // 触发响应式
  selected.value = new Set(selected.value)
}

const selectAll = (): void => {
  selected.value = new Set(selectableIndices.value)
}

const invertSelection = (): void => {
  const next = new Set<number>()
  for (const i of selectableIndices.value) {
    if (!selected.value.has(i)) next.add(i)
  }
  selected.value = next
}

const clearSelection = (): void => {
  selected.value = new Set()
}

// 构建复制文本
const buildText = (indices: number[]): string => {
  const lines: string[] = []
  // 可选歌名/歌手抬头
  if (props.songTitle) {
    const head = props.artist ? `${props.songTitle} - ${props.artist}` : props.songTitle
    lines.push(head)
    lines.push('')
  }
  for (const i of indices) {
    const v = visibleLines.value[i]
    if (!v || !v.hasContent) continue
    const prefix = includeTimestamp.value ? formatTs(v.startTime) + ' ' : ''
    lines.push(prefix + v.main)
    if (includeTranslation.value && v.translation) {
      lines.push((includeTimestamp.value ? '          ' : '') + v.translation)
    }
    if (includeRomaji.value && v.romaji) {
      lines.push((includeTimestamp.value ? '          ' : '') + v.romaji)
    }
  }
  return lines.join('\n').trim()
}

const doCopy = async (text: string, label: string): Promise<void> => {
  if (!text) {
    MessagePlugin.warning('没有可复制的歌词内容')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    MessagePlugin.success(label)
  } catch {
    // 部分环境 clipboard 不可用,降级到 execCommand
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.top = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      MessagePlugin.success(label)
    } catch {
      MessagePlugin.error('复制失败,请检查浏览器权限')
    }
  }
}

const copySelected = (): void => {
  const indices = selectableIndices.value.filter((i) => selected.value.has(i))
  if (indices.length === 0) {
    MessagePlugin.warning('请先勾选要复制的歌词')
    return
  }
  const text = buildText(indices)
  void doCopy(text, `已复制 ${indices.length} 行歌词`)
}

const copyAll = (): void => {
  const indices = selectableIndices.value
  if (indices.length === 0) {
    MessagePlugin.warning('当前没有可复制的歌词')
    return
  }
  const text = buildText(indices)
  void doCopy(text, `已复制全部 ${indices.length} 行歌词`)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-overlay">
      <div v-show="show" class="lyric-copy-overlay" @click.self="$emit('close')">
        <div class="copy-card">
          <!-- Header -->
          <div class="header">
            <div class="title">
              <span class="title-main">复制歌词</span>
              <span v-if="songTitle" class="title-sub">
                · {{ songTitle }}<span v-if="artist"> - {{ artist }}</span>
              </span>
            </div>
            <button class="close-btn" @click="$emit('close')">
              <CloseIcon size="22" />
            </button>
          </div>

          <!-- Toolbar -->
          <div class="toolbar">
            <div class="toolbar-left">
              <label class="check-row" :class="{ 'is-indeterminate': someSelected }">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  @change="allSelected ? clearSelection() : selectAll()"
                />
                <span>全选</span>
              </label>
              <button class="ghost-btn" @click="invertSelection">反选</button>
              <button class="ghost-btn" @click="clearSelection">清空</button>
              <span class="count-hint">
                已选 {{ selectedCount }} / {{ selectableIndices.length }}
              </span>
            </div>
            <div class="toolbar-right">
              <label class="opt">
                <input v-model="includeTranslation" type="checkbox" />
                <span>含翻译</span>
              </label>
              <label class="opt">
                <input v-model="includeRomaji" type="checkbox" />
                <span>含音译</span>
              </label>
              <label class="opt">
                <input v-model="includeTimestamp" type="checkbox" />
                <span>含时间戳</span>
              </label>
            </div>
          </div>

          <!-- Content -->
          <div class="content">
            <div v-if="visibleLines.length === 0" class="empty-state">暂无歌词可复制</div>
            <ul v-else class="line-list">
              <li
                v-for="row in visibleLines"
                :key="row.idx"
                class="line-row"
                :class="{
                  'is-empty': !row.hasContent,
                  'is-checked': selected.has(row.idx)
                }"
                @click="row.hasContent && toggleLine(row.idx)"
              >
                <input
                  v-if="row.hasContent"
                  type="checkbox"
                  class="row-checkbox"
                  :checked="selected.has(row.idx)"
                  @click.stop
                  @change="toggleLine(row.idx)"
                />
                <span v-else class="row-spacer" />
                <div class="row-text">
                  <div v-if="!row.hasContent" class="line-empty">♪</div>
                  <div v-else class="line-main">
                    <span v-if="includeTimestamp" class="line-ts">{{
                      formatTs(row.startTime)
                    }}</span>
                    {{ row.main }}
                  </div>
                  <div v-if="row.translation && includeTranslation" class="line-extra">
                    {{ row.translation }}
                  </div>
                  <div v-if="row.romaji && includeRomaji" class="line-extra line-romaji">
                    {{ row.romaji }}
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <!-- Footer -->
          <div class="footer">
            <button class="footer-btn" @click="$emit('close')">取消</button>
            <button
              class="footer-btn primary"
              :disabled="selectedCount === 0"
              @click="copySelected"
            >
              <CopyIcon size="16" />
              复制选中 ({{ selectedCount }})
            </button>
            <button class="footer-btn brand" @click="copyAll">
              <CopyIcon size="16" />
              复制全部
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.lyric-copy-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1001;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
}

.copy-card {
  width: min(720px, 80vw);
  height: min(80vh, 820px);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(60px);
  -webkit-backdrop-filter: blur(60px);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #fff;
}

.header {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.1);

  .title {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }
  .title-main {
    font-size: 17px;
    font-weight: 600;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  .title-sub {
    font-size: 13px;
    opacity: 0.65;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 380px;
  }
}

.close-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.3s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  font-size: 13px;

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
}

.check-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;

  input[type='checkbox'] {
    width: 14px;
    height: 14px;
    accent-color: v-bind(mainColor);
    cursor: pointer;
  }
}

.ghost-btn {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
  }
}

.count-hint {
  font-size: 12px;
  opacity: 0.65;
  margin-left: 4px;
}

.opt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  opacity: 0.85;

  input[type='checkbox'] {
    width: 14px;
    height: 14px;
    accent-color: v-bind(mainColor);
    cursor: pointer;
  }

  &:hover {
    opacity: 1;
  }
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 18px;
  // 滚动条样式 —— 对齐"一起听"聊天面板(ChatPanel.vue)的视觉:
  // 细滚动条 + 半透明白色滑块,与 backdrop-blur 玻璃质感更协调
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

.empty-state {
  text-align: center;
  opacity: 0.5;
  padding: 60px 0;
  font-size: 14px;
}

.line-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.line-row {
  display: flex;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.18s ease;
  align-items: flex-start;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &.is-checked {
    background: rgba(255, 255, 255, 0.08);
  }

  &.is-empty {
    cursor: default;
    opacity: 0.4;
    &:hover {
      background: transparent;
    }
  }
}

.row-checkbox {
  margin-top: 4px;
  width: 16px;
  height: 16px;
  accent-color: v-bind(mainColor);
  cursor: pointer;
  flex-shrink: 0;
}

.row-spacer {
  display: inline-block;
  width: 16px;
  flex-shrink: 0;
}

.row-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.line-main {
  font-size: 15px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.95);
}

.line-ts {
  display: inline-block;
  margin-right: 8px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: rgba(255, 255, 255, 0.5);
}

.line-extra {
  font-size: 13px;
  line-height: 1.45;
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.65);
}

.line-romaji {
  font-style: italic;
  color: rgba(255, 255, 255, 0.55);
}

.line-empty {
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  text-align: center;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.1);
}

.footer-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  padding: 6px 16px;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s,
    transform 0.15s;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.primary {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.25);
  }

  &.brand {
    background: v-bind(mainColor);
    border-color: transparent;
    color: #fff;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);

    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }
  }
}

.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.3s ease;
}
.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}
</style>
