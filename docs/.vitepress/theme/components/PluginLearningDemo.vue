<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{ mode?: 'command' | 'search' | 'storage' }>(), {
  mode: 'search'
})
const query = ref('Morning')
const submitted = ref('Morning')
const message = ref('')
const count = ref(0)
const savedCount = ref<number | null>(null)
const tracks = [
  { id: 'morning', title: 'Morning Light', artist: 'Ceru Demo' },
  { id: 'rain', title: 'Rainy Afternoon', artist: 'Ceru Demo' },
  { id: 'night', title: 'Night Walk', artist: 'Ceru Demo' }
]
const matches = computed(() => {
  const keyword = submitted.value.trim().toLowerCase()
  return tracks.filter((track) =>
    (track.title + ' ' + track.artist).toLowerCase().includes(keyword)
  )
})
function greet() {
  message.value = '你好，这是我的第一个澜音插件！'
}
function save() {
  count.value = (savedCount.value ?? 0) + 1
  savedCount.value = count.value
  message.value = '这是第 ' + count.value + ' 次问候'
}
function reload() {
  count.value = savedCount.value ?? 0
  message.value = '重新读取 visits：' + count.value
}
function reset() {
  count.value = 0
  savedCount.value = null
  message.value = 'visits 已清除，再次执行将从 1 开始'
}
</script>

<template>
  <section class="learning-demo" :aria-label="mode === 'search' ? '搜索交互演示' : '命令交互演示'">
    <div class="demo-heading">
      <span>试一试</span>
      <small>文档内演示</small>
    </div>
    <template v-if="mode === 'search'">
      <form class="demo-search" @submit.prevent="submitted = query">
        <label for="plugin-demo-query">搜索演示曲库</label>
        <div class="demo-controls">
          <input id="plugin-demo-query" v-model="query" placeholder="输入 Morning、Rain 或 Night" />
          <button type="submit">搜索</button>
        </div>
      </form>
      <ul class="demo-results" aria-live="polite">
        <li v-for="track in matches" :key="track.id">
          <span class="demo-note" aria-hidden="true">♫</span>
          <div>
            <strong>{{ track.title }}</strong
            ><small>{{ track.artist }}</small>
          </div>
          <span class="demo-tag">演示数据</span>
        </li>
        <li v-if="!matches.length" class="demo-empty">没有匹配的歌曲，试试 Rain。</li>
      </ul>
      <div class="demo-flow">
        <span>输入关键词</span><span aria-hidden="true">→</span><span>插件筛选数据</span>
        <span aria-hidden="true">→</span><span>澜音显示结果</span>
      </div>
    </template>
    <template v-else>
      <div class="demo-controls">
        <button type="button" @click="mode === 'storage' ? save() : greet()">执行 hello</button>
        <template v-if="mode === 'storage'">
          <button type="button" class="demo-secondary" @click="reload">模拟重新读取</button>
          <button type="button" class="demo-secondary" @click="reset">清除记录</button>
        </template>
      </div>
      <output class="demo-output" aria-live="polite">{{
        message || '点击按钮，查看执行结果。'
      }}</output>
      <div v-if="mode === 'storage'" class="demo-flow">
        <code>visits</code><span>当前保存值：</span
        ><strong>{{ savedCount ?? 'null（尚未写入）' }}</strong>
      </div>
    </template>
    <p class="demo-caption">
      <template v-if="mode === 'storage'"
        >这里用页面内存演示读写过程，刷新文档会重置。桌面的持久化验证见下文。</template
      >
      <template v-else
        >本例只演示交互结果，不会安装插件、联网或播放音乐。接下来会在工作台运行真实代码。</template
      >
    </p>
  </section>
</template>

<style scoped>
.learning-demo {
  margin: 24px 0;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-base);
}
.demo-heading,
.demo-controls,
.demo-flow {
  display: flex;
  align-items: center;
  gap: 12px;
}
.demo-heading {
  justify-content: space-between;
  margin-bottom: 20px;
  font-weight: 600;
}
.demo-heading small,
.demo-caption,
.demo-flow {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
.demo-search label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
}
.demo-controls {
  flex-wrap: wrap;
}
input {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
}
button {
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 6px;
  background: var(--vp-c-brand-1);
  padding: 9px 14px;
  color: var(--vp-c-white);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
button.demo-secondary {
  background: var(--vp-c-bg);
  border-color: var(--vp-c-divider);
  color: var(--vp-c-text-1);
}
button:hover {
  opacity: 0.85;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}
.demo-results {
  padding: 0 !important;
  margin: 18px 0 !important;
  list-style: none !important;
}
.demo-results li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  margin: 0;
  border-top: 1px solid var(--vp-c-divider);
}
.demo-results li::before {
  content: none !important;
}
.demo-results strong,
.demo-results small {
  display: block;
}
.demo-results small {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
.demo-note {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
.demo-tag {
  margin-left: auto;
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.demo-flow {
  flex-wrap: wrap;
  gap: 7px;
  padding: 12px 0 0;
}
.demo-output {
  display: block;
  margin: 18px 0 0;
  padding: 14px;
  background: var(--vp-c-bg);
  border-radius: 8px;
  min-height: 52px;
}
.demo-caption {
  margin: 16px 0 0 !important;
  line-height: 1.7;
  font-size: 13px !important;
}
@media (max-width: 480px) {
  .learning-demo {
    padding: 18px;
  }
  .demo-tag {
    display: none;
  }
}
</style>
