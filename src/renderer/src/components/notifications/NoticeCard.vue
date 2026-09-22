<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import gsap from 'gsap'
import type { InboxMessage } from '@renderer/api/notifications'

const props = defineProps<{ message: InboxMessage }>()
const emit = defineEmits<{ seen: []; open: [] }>()
const root = ref<HTMLElement>()
const body = ref<HTMLElement>()
const content = ref<HTMLElement>()
const expanded = ref(false)
const overflowing = ref(false)
const animating = ref(false)
const limit = computed(() => Math.max(100, Math.min(props.message.maxHeight || 180, 600)))
const markdownRenderer = new marked.Renderer()
const renderTable = markdownRenderer.table.bind(markdownRenderer)
markdownRenderer.table = (token) => `<div class="markdown-table">${renderTable(token)}</div>`
const html = computed(() =>
  DOMPurify.sanitize(
    marked.parse(props.message.content, { async: false, renderer: markdownRenderer }),
    {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['iframe', 'style', 'form', 'input', 'button']
    }
  )
)
const embedUrl = computed(() => {
  try {
    const url = new URL(props.message.embedUrl || '')
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
})
let observer: IntersectionObserver | undefined
let resize: ResizeObserver | undefined
let motion: gsap.core.Tween | undefined

function measure() {
  if (!content.value || !body.value) return
  overflowing.value = content.value.scrollHeight > limit.value + 2
}
async function toggle() {
  if (!body.value || !content.value || (!overflowing.value && !expanded.value)) return
  const startHeight = body.value.getBoundingClientRect().height
  motion?.kill()
  expanded.value = !expanded.value
  animating.value = true
  await nextTick()
  if (!body.value || !content.value) return
  motion = gsap.fromTo(
    body.value,
    { height: startHeight },
    {
      height: expanded.value
        ? content.value.scrollHeight
        : Math.min(limit.value, content.value.scrollHeight),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.32,
      ease: 'power2.inOut',
      overwrite: true,
      onComplete: () => {
        body.value?.style.removeProperty('height')
        animating.value = false
        measure()
      }
    }
  )
}
function followLink(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest('a')
  if (!anchor) return
  event.preventDefault()
  try {
    const url = new URL(anchor.href)
    if (['http:', 'https:'].includes(url.protocol))
      window.open(url.href, '_blank', 'noopener,noreferrer')
  } catch {
    /* Ignore malformed URLs. */
  }
}
onMounted(() => {
  measure()
  resize = new ResizeObserver(measure)
  if (content.value) resize.observe(content.value)
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        emit('seen')
        observer?.disconnect()
      }
    },
    { root: root.value?.closest('.inbox-scroll'), threshold: 0.01 }
  )
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  resize?.disconnect()
  motion?.kill()
})
</script>
<template>
  <article ref="root" class="notice-card" :class="{ unread: !message.read }">
    <header>
      <span class="notice-source">{{
        message.kind === 'moderation' ? '社区管理' : '澜音官方'
      }}</span
      ><time>{{ new Date(message.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</time>
    </header>
    <button
      class="notice-title"
      :aria-expanded="message.postId ? undefined : expanded"
      @click="message.postId ? emit('open') : toggle()"
    >
      {{ message.title }}<i v-if="!message.read" />
    </button>
    <div
      ref="body"
      class="notice-body"
      :class="{ clipped: overflowing && !expanded }"
      :style="{ maxHeight: expanded || animating ? undefined : `${limit}px` }"
    >
      <div ref="content" @click="followLink">
        <div v-if="message.format === 'markdown'" class="markdown" v-html="html" />
        <p v-else class="plain">{{ message.content }}</p>
        <template v-if="message.format === 'iframe'">
          <!-- sandbox 必须带 allow-same-origin:没有它嵌入页是 opaque origin(null),
               连自己源的 localStorage/cookie 都读不了(Pinia/vue-router 启动即抛
               SecurityError),模块脚本、CSS、字体还会被当成跨域拦掉。
               页面是第三方源,allow-same-origin 只是把它的正常同源权限还给
               自己那一份,依然够不到澜音本体(跨源,拿不到父窗口)。 -->
          <iframe
            v-if="embedUrl"
            :src="embedUrl"
            :title="message.title"
            sandbox="allow-scripts allow-same-origin"
            referrerpolicy="no-referrer"
            loading="lazy"
          />
          <p v-else>网页地址不可用</p>
          <p class="embed-hint">
            网页无法显示？<a v-if="embedUrl" :href="embedUrl">在浏览器打开</a>
          </p>
        </template>
      </div>
    </div>
    <button v-if="overflowing" class="expand" :aria-expanded="expanded" @click="toggle">
      {{ expanded ? '收起内容 ↑' : '展开全文 ↓' }}
    </button>
    <button v-if="message.postId" class="view-post" @click="emit('open')">查看笔记 →</button>
  </article>
</template>
<style scoped>
.notice-card {
  padding: 14px;
  border: 1px solid var(--td-component-border);
  border-radius: 12px;
  background: var(--td-bg-color-container);
}
.notice-card.unread {
  border-color: color-mix(in srgb, var(--td-brand-color) 38%, transparent);
}
header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  margin-bottom: 8px;
}
.notice-source {
  color: var(--td-brand-color);
  font-weight: 600;
}
.notice-title {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 15px;
  line-height: 1.5;
  font-weight: 650;
  padding: 0 0 6px;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
}
.notice-title i {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--td-error-color);
  vertical-align: middle;
  margin-left: 8px;
}
.notice-body {
  overflow: hidden;
  position: relative;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.notice-body > div {
  display: flow-root;
}
.clipped::after {
  content: '';
  pointer-events: none;
  position: absolute;
  inset: auto 0 0;
  height: 40px;
  background: linear-gradient(transparent, var(--td-bg-color-container));
}
.plain {
  margin: 0;
  white-space: pre-wrap;
}
iframe {
  display: block;
  width: 100%;
  height: 520px;
  border: 0;
  border-radius: 8px;
  background: white;
}
.embed-hint {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
.expand,
.view-post {
  margin-top: 8px;
  color: var(--td-brand-color);
  background: none;
  border: 0;
  cursor: pointer;
  padding: 4px 0;
  font-size: 12px;
}
.view-post {
  display: block;
}
.markdown {
  font-family: inherit;
  font-size: 13px;
  line-height: 1.75;
  color: var(--td-text-color-secondary);
  user-select: text;
}
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3),
.markdown :deep(h4),
.markdown :deep(h5),
.markdown :deep(h6) {
  margin: 14px 0 6px;
  color: var(--td-text-color-primary);
  font-weight: 650;
  line-height: 1.5;
  letter-spacing: 0.01em;
}
.markdown :deep(h1) {
  font-size: 17px;
}
.markdown :deep(h2) {
  font-size: 15px;
}
.markdown :deep(h3) {
  font-size: 14px;
}
.markdown :deep(h4),
.markdown :deep(h5),
.markdown :deep(h6) {
  font-size: 13px;
}
.markdown :deep(p) {
  margin: 6px 0;
}
.markdown :deep(strong),
.markdown :deep(b) {
  font-weight: 600;
  color: var(--td-text-color-primary);
}
.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
  list-style-position: outside;
}
.markdown :deep(ul) {
  list-style-type: disc;
}
.markdown :deep(ol) {
  list-style-type: decimal;
}
.markdown :deep(li) {
  padding-left: 2px;
  margin: 3px 0;
}
.markdown :deep(li::marker) {
  color: var(--td-brand-color);
  font-weight: 600;
}
.markdown :deep(li > ul),
.markdown :deep(li > ol),
.markdown :deep(li > p) {
  margin: 3px 0;
}
.markdown :deep(blockquote) {
  margin: 10px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--td-brand-color);
  border-radius: 0 8px 8px 0;
  background: color-mix(in srgb, var(--td-brand-color) 7%, transparent);
  color: var(--td-text-color-secondary);
}
.markdown :deep(blockquote > :first-child) {
  margin-top: 0;
}
.markdown :deep(blockquote > :last-child) {
  margin-bottom: 0;
}
.markdown :deep(code),
.markdown :deep(kbd) {
  padding: 2px 5px;
  border: 1px solid var(--td-component-border);
  border-radius: 5px;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-primary);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 0.9em;
  white-space: break-spaces;
}
.markdown :deep(pre) {
  margin: 10px 0;
  padding: 10px 12px;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
  line-height: 1.65;
  scrollbar-width: thin;
  scrollbar-color: var(--td-scrollbar-color) transparent;
}
.markdown :deep(pre code) {
  display: block;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  white-space: pre;
  overflow-wrap: normal;
}
.markdown :deep(hr) {
  margin: 14px 0;
  border: 0;
  border-top: 1px solid var(--td-component-border);
}
.markdown :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 10px 0;
  border-radius: 8px;
}
.markdown :deep(.markdown-table) {
  max-width: 100%;
  margin: 10px 0;
  overflow: auto;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  font-size: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--td-scrollbar-color) transparent;
}
.markdown :deep(table) {
  width: 100%;
  border-spacing: 0;
  font: inherit;
  color: var(--td-text-color-secondary);
}
.markdown :deep(td),
.markdown :deep(th) {
  padding: 7px 10px;
  min-width: 88px;
  border: 0;
  border-bottom: 1px solid var(--td-component-border);
  color: var(--td-text-color-secondary);
}
.markdown :deep(th) {
  font-weight: 600;
  color: var(--td-text-color-primary);
  background: var(--td-bg-color-secondarycontainer);
}
.markdown :deep(th:not([align])) {
  text-align: start;
}
.markdown :deep(tbody tr:last-child td) {
  border-bottom: 0;
}
.markdown :deep(tbody tr:nth-child(even)) {
  background: color-mix(in srgb, var(--td-bg-color-secondarycontainer) 55%, transparent);
}
.markdown :deep(a) {
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--td-brand-color) 35%, transparent);
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  transition:
    color 0.15s,
    text-decoration-color 0.15s;
}
.markdown :deep(a:hover) {
  color: var(--td-brand-color-hover);
  text-decoration-color: currentColor;
}
.markdown :deep(a:focus-visible) {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
  border-radius: 2px;
}
.markdown :deep(> :first-child) {
  margin-top: 0;
}
.markdown :deep(> :last-child) {
  margin-bottom: 0;
}
.notice-body :deep(a) {
  color: var(--td-brand-color);
}
</style>
