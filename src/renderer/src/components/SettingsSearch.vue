<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SearchIcon, TimeIcon, ChevronRightIcon } from 'tdesign-icons-vue-next'
import { searchItems, type SearchItem } from '@renderer/views/settings/searchIndex'
import { matchText } from '@renderer/utils/search'

const emit = defineEmits(['select'])

const query = ref('')
const isFocused = ref(false)
const searchInputRef = ref()
const selectedIndex = ref(-1)

// Recent searches from localStorage
const recentSearches = ref<string[]>([])
const MAX_RECENT = 5

onMounted(() => {
  try {
    console.log('SettingsSearch: Component mounted')
    const saved = localStorage.getItem('settings_recent_searches')
    if (saved) {
      recentSearches.value = JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to load recent searches', e)
  }
})

const saveRecent = (id: string) => {
  const newRecent = [id, ...recentSearches.value.filter((i) => i !== id)].slice(0, MAX_RECENT)
  recentSearches.value = newRecent
  localStorage.setItem('settings_recent_searches', JSON.stringify(newRecent))
}

const searchResults = computed(() => {
  if (!query.value.trim()) return []

  const q = query.value.trim()
  return searchItems.filter((item) => {
    // Match title
    if (matchText(item.title, q)) return true
    // Match description
    if (item.description && matchText(item.description, q)) return true
    // Match keywords (which can include pinyin)
    if (item.keywords && item.keywords.some((k) => matchText(k, q))) return true
    return false
  })
})

const displayItems = computed(() => {
  if (!query.value.trim()) {
    // Return recent items objects
    return recentSearches.value
      .map((id) => searchItems.find((item) => item.id === id))
      .filter((item): item is SearchItem => !!item)
  }
  return searchResults.value
})

const handleFocus = () => {
  isFocused.value = true
}

const handleBlur = () => {
  // Delay hide to allow click event to register
  setTimeout(() => {
    isFocused.value = false
  }, 200)
}

const handleSelect = (item: SearchItem) => {
  console.log('SettingsSearch: Selected item', item)
  saveRecent(item.id)
  query.value = ''
  isFocused.value = false
  if (searchInputRef.value) {
    searchInputRef.value.blur()
  }
  emit('select', item)
}

const handleKeydown = (_value: unknown, { e }: { e: KeyboardEvent }) => {
  if (!isFocused.value) return

  const items = displayItems.value
  if (items.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % items.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + items.length) % items.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedIndex.value >= 0 && selectedIndex.value < items.length) {
      handleSelect(items[selectedIndex.value])
    } else if (items.length > 0) {
      handleSelect(items[0])
    }
  }
}
</script>

<template>
  <div class="settings-search">
    <div class="search-input-wrapper">
      <t-input
        ref="searchInputRef"
        v-model="query"
        placeholder="搜索设置..."
        clearable
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
      >
        <template #prefix-icon>
          <SearchIcon />
        </template>
      </t-input>
    </div>

    <!-- Search Results Dropdown -->
    <transition name="fade">
      <div v-if="isFocused" class="search-dropdown" @mousedown.prevent>
        <div v-if="displayItems.length > 0" class="search-list">
          <div v-if="!query" class="list-header">最近使用</div>
          <div
            v-for="(item, index) in displayItems"
            :key="item.id"
            class="search-item"
            :class="{ active: index === selectedIndex }"
            @mousedown.prevent="handleSelect(item)"
            @mouseenter="selectedIndex = index"
          >
            <div class="item-icon">
              <TimeIcon v-if="!query" />
              <SearchIcon v-else />
            </div>
            <div class="item-content">
              <div class="item-title">{{ item.title }}</div>
              <div v-if="item.description" class="item-desc">{{ item.description }}</div>
              <div v-else class="item-path">{{ item.category }}</div>
            </div>
            <div class="item-action">
              <ChevronRightIcon />
            </div>
          </div>
        </div>
        <div v-else-if="query" class="no-results">
          <div class="no-result-icon">
            <SearchIcon />
          </div>
          <p>未找到相关设置</p>
        </div>
        <div v-else class="empty-recent">
          <p>输入关键词开始搜索</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<style lang="scss" scoped>
.settings-search {
  position: relative;
  width: 240px;
  margin-right: 12px;
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  height: 32px; /* Ensure height */
  z-index: 2000;
}

.search-input-wrapper {
  width: 100%;
}

.search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0; // Make it wider if needed? Or fit width
  width: 320px; // Wider than input
  max-height: 400px;
  overflow-y: auto;
  background: var(--settings-group-bg); // Use theme var
  border: 1px solid var(--settings-group-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  margin-top: 8px;
  z-index: 2000;
  padding: 8px 0;

  // Dark mode compatibility via CSS variables assumed present
  // If not, we might need fallback
  background-color: var(--td-bg-color-container, #fff);
  border-color: var(--td-component-stroke, #e7e7e7);
}

.list-header {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--td-text-color-placeholder, #999);
}

.search-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  gap: 12px;

  &:hover,
  &.active {
    background-color: var(--td-bg-color-container-hover, #f3f3f3);
  }

  .item-icon {
    color: var(--td-text-color-secondary, #666);
    display: flex;
    align-items: center;
  }

  .item-content {
    flex: 1;
    overflow: hidden;

    .item-title {
      font-size: 14px;
      color: var(--td-text-color-primary, #333);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-desc,
    .item-path {
      font-size: 12px;
      color: var(--td-text-color-secondary, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .item-action {
    color: var(--td-text-color-placeholder, #ccc);
  }
}

.no-results,
.empty-recent {
  padding: 24px;
  text-align: center;
  color: var(--td-text-color-secondary, #666);
  font-size: 13px;

  .no-result-icon {
    font-size: 24px;
    margin-bottom: 8px;
    opacity: 0.5;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
