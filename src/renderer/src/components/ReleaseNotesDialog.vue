<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { LinkIcon, RefreshIcon } from 'tdesign-icons-vue-next'

interface GitHubRelease {
  id: number
  name: string | null
  tag_name: string
  body: string | null
  html_url: string
  published_at: string | null
  prerelease: boolean
}

const REPOSITORY = 'timeshiftsauce/CeruMusic'
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`
const RELEASES_API_URL = `https://api.github.com/repos/${REPOSITORY}/releases`
const PAGE_SIZE = 25

const visible = ref(false)
const releases = ref<GitHubRelease[]>([])
const loading = ref(false)
const error = ref('')
const page = ref(0)
const hasMore = ref(true)
const expandedRelease = ref<string[]>([])
const hasLoaded = ref(false)
const totalReleaseCount = ref<number | null>(null)
let countRequestStarted = false

const formattedReleases = computed(() =>
  releases.value.map((release) => ({
    ...release,
    formattedDate: release.published_at
      ? new Date(release.published_at).toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : '日期未知',
    notesHtml: renderMarkdown(release.body)
  }))
)

function renderMarkdown(source: string | null) {
  if (!source?.trim()) return '<p>此版本没有提供更新说明。</p>'
  try {
    return DOMPurify.sanitize(
      marked.parse(source, { async: false, gfm: true, breaks: true }) as string
    )
  } catch {
    return DOMPurify.sanitize(`<pre>${source}</pre>`)
  }
}

async function loadReleases() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  error.value = ''
  const nextPage = page.value + 1
  try {
    const response = await fetch(`${RELEASES_API_URL}?per_page=${PAGE_SIZE}&page=${nextPage}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = (await response.json()) as GitHubRelease[]
    if (!Array.isArray(result)) throw new Error('Invalid GitHub response')
    releases.value.push(...result.filter((release) => typeof release.tag_name === 'string'))
    page.value = nextPage
    hasMore.value = result.length === PAGE_SIZE
    hasLoaded.value = true
  } catch {
    error.value = '无法获取更新日志，请检查网络连接后重试。'
  } finally {
    loading.value = false
  }
}

async function loadReleaseCount() {
  if (countRequestStarted) return
  countRequestStarted = true
  try {
    const response = await fetch(`${RELEASES_API_URL}?per_page=1&page=1`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      countRequestStarted = false
      return
    }
    const pagination = response.headers.get('Link') || ''
    const lastPage = pagination.match(/[?&]page=(\d+)>;\s*rel="last"/)
    if (lastPage) {
      totalReleaseCount.value = Number(lastPage[1])
    } else {
      const result = (await response.json()) as GitHubRelease[]
      if (Array.isArray(result)) totalReleaseCount.value = result.length
    }
  } catch {
    countRequestStarted = false
  }
}

function onReleaseListScroll(event: Event) {
  const list = event.currentTarget as HTMLElement
  if (list.scrollHeight - list.scrollTop - list.clientHeight < 80) {
    void loadReleases()
  }
}

function open() {
  visible.value = true
}

function openGitHubReleases() {
  window.open(RELEASES_URL, '_blank')
}

watch(visible, (isVisible) => {
  if (isVisible) {
    if (!hasLoaded.value) void loadReleases()
    void loadReleaseCount()
  }
})

defineExpose({ open })
</script>

<template>
  <t-dialog
    v-model:visible="visible"
    header="更新日志"
    :footer="false"
    width="min(760px, calc(100vw - 32px))"
    placement="center"
    attach="body"
    dialog-class-name="release-notes-dialog"
  >
    <div class="release-toolbar">
      <span v-if="hasLoaded">
        {{
          totalReleaseCount === null
            ? `已加载 ${releases.length} 个版本`
            : `共 ${totalReleaseCount} 个版本`
        }}
      </span>
      <t-button variant="text" size="small" @click="openGitHubReleases">
        <template #icon><LinkIcon /></template>
        前往 GitHub Releases
      </t-button>
    </div>

    <div v-if="loading && !releases.length" class="release-state" role="status">
      正在加载更新日志…
    </div>
    <div v-else-if="error && !releases.length" class="release-state release-error" role="alert">
      <p>{{ error }}</p>
      <t-button theme="primary" variant="outline" @click="loadReleases">
        <template #icon><RefreshIcon /></template>
        重试
      </t-button>
    </div>
    <div v-else-if="hasLoaded && !releases.length" class="release-state">
      暂时没有可显示的 Release。
    </div>

    <div v-else-if="releases.length" class="release-list" @scroll.passive="onReleaseListScroll">
      <n-collapse v-model:expanded-names="expandedRelease" accordion arrow-placement="right">
        <n-collapse-item
          v-for="release in formattedReleases"
          :key="release.id"
          :name="String(release.id)"
        >
          <template #header>
            <div class="release-heading-copy">
              <span class="release-title">{{ release.name || release.tag_name }}</span>
              <span class="release-meta">
                <span>{{ release.tag_name }}</span>
                <span v-if="release.prerelease">预发布</span>
                <span>{{ release.formattedDate }}</span>
              </span>
            </div>
          </template>
          <div class="release-content">
            <div class="release-markdown" v-html="release.notesHtml"></div>
            <a :href="release.html_url" target="_blank" rel="noopener noreferrer">
              在 GitHub 查看此版本
              <LinkIcon aria-hidden="true" />
            </a>
          </div>
        </n-collapse-item>
      </n-collapse>
      <div v-if="loading" class="release-load-state" role="status">正在加载更多更新日志…</div>
      <div v-else-if="error" class="release-load-state" role="alert">
        <span>{{ error }}</span>
        <t-button theme="primary" variant="text" size="small" @click="loadReleases">
          重试加载
        </t-button>
      </div>
    </div>
  </t-dialog>
</template>

<style lang="scss" scoped>
.release-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -8px 0 12px;
  color: var(--settings-text-secondary);
  font-size: 0.8125rem;
}

.release-list {
  max-height: min(62vh, calc(100vh - 260px), 620px);
  overflow: auto;
  padding: 5px;
  border: 1px solid var(--settings-group-border);
  border-radius: 8px;
  scrollbar-gutter: stable;
}

:global(.release-notes-dialog .t-dialog__body) {
  max-height: calc(100vh - 176px);
  overflow-y: auto;
}

:global(.release-notes-dialog .n-collapse) {
  border-top: 0;
}

:global(.release-notes-dialog .release-list .n-collapse-item) {
  margin: 0;
}

:global(.release-notes-dialog .release-list .n-collapse-item:last-child) {
  border-bottom: 0;
}

:global(.release-notes-dialog .release-list .n-collapse-item__header) {
  min-height: 64px;
  padding: 12px 13px;
}

:global(
  .release-notes-dialog
    .release-list
    .n-collapse
    > .n-collapse-item:first-child
    > .n-collapse-item__header
) {
  padding-top: 12px;
}

:global(.release-notes-dialog .release-list .n-collapse-item__header:hover) {
  background: var(--settings-nav-hover-bg);
}

:global(.release-notes-dialog .n-collapse-item__content-inner) {
  padding: 0 16px 16px;
}

.release-heading-copy {
  display: grid;
  width: 100%;
  flex: 1;
  min-width: 0;
  gap: 5px;
}

.release-title {
  overflow-wrap: anywhere;
  font-weight: 600;
}

.release-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: var(--settings-text-secondary);
  font-size: 0.8125rem;
}

.release-content {
  color: var(--settings-text-secondary);
}

.release-content > a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  color: var(--td-brand-color-5);
  text-decoration: none;
}

.release-content > a:hover {
  text-decoration: underline;
}

.release-state {
  display: grid;
  min-height: 150px;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--settings-text-secondary);
  text-align: center;
}

.release-state p {
  margin: 0;
}

.release-load-state {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  color: var(--settings-text-secondary);
  font-size: 0.8125rem;
  text-align: center;
}

.release-markdown {
  overflow-wrap: anywhere;
  line-height: 1.7;
}

.release-markdown :deep(:first-child) {
  margin-top: 0;
}

.release-markdown :deep(:last-child) {
  margin-bottom: 0;
}

.release-markdown :deep(pre) {
  overflow-x: auto;
  padding: 12px;
  border-radius: 6px;
  background: var(--settings-tech-item-bg);
}

.release-markdown :deep(code) {
  overflow-wrap: anywhere;
}

.release-markdown :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
