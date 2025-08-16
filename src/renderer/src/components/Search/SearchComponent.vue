<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const keyword = ref('')
const isSearching = ref(false)

// 搜索类型：1: 单曲, 10: 专辑, 100: 歌手, 1000: 歌单

// 处理搜索事件
const handleSearch = async () => {
  if (!keyword.value.trim()) return

  isSearching.value = true
  try {
    // 调用搜索API

    // 跳转到搜索结果页面，并传递搜索结果和关键词
    router.push({
      path: '/home/search',
      query: { keyword: keyword.value },
    })
  } catch (error) {
    console.error('搜索失败:', error)
  } finally {
    isSearching.value = false
  }
}

// 处理按键事件，按下回车键时触发搜索
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    handleSearch()
  }
}
</script>

<template>
  <div class="search-component">
    <t-input
      v-model="keyword"
      placeholder="搜索音乐、歌手"
      :loading="isSearching"
      @keydown="handleKeyDown"
    >
      <template #suffix>
        <t-button
          theme="primary"
          variant="text"
          shape="square"
          :disabled="isSearching"
          @click="handleSearch"
        >
          <i class="iconfont icon-sousuo"></i>
        </t-button>
      </template>
    </t-input>
  </div>
</template>

<style lang="scss" scoped>
.search-component {
  width: 100%;

  :deep(.t-input) {
    border-radius: 0rem !important;
    border: none;
    box-shadow: none;
  }

  :deep(.t-input__suffix) {
    padding-right: 0.5rem;
  }

  .iconfont {
    font-size: 1rem;
    color: #6b7280;
    transition: color 0.2s ease;

    &:hover {
      color: #f97316;
    }
  }
}
</style>
