<template>
  <Transition
    name="fadeDown"
    mode="out-in"
    @after-enter="calcSearchSuggestHeights"
    @after-leave="calcSearchSuggestHeights"
  >
    <n-card
      v-if="SearchStore.focus && SearchStore.value"
      class="search-suggest"
      content-style="padding: 0"
      :style="{
        height: `${searchSuggestHeights}px`,
        border: searchSuggestHeights === 0 ? 'none' : null
      }"
    >
      <n-scrollbar class="scrollbar">
        <!-- 直接搜索 -->
        <div
          ref="directSearchRef"
          class="direct"
          @click="emit('toSearch', SearchStore.value, 'keyword')"
        >
          <SvgIcon name="Search" :depth="3" />
          <n-text class="text text-hidden">直接搜索：{{ SearchStore.value }}</n-text>
        </div>
        <!-- 搜索建议 -->
        <Transition name="fade" mode="out-in" @after-leave="calcSearchSuggestHeights">
          <div
            v-if="Object.keys(searchSuggestData)?.length && searchSuggestData?.order"
            ref="searchSuggestRef"
            class="all-suggest"
          >
            <div v-for="(item, index) in searchSuggestData.order" :key="index" class="suggest">
              <div class="suggest-type">
                <SvgIcon :name="searchSuggestionsType[item].icon" />
                <n-text>{{ searchSuggestionsType[item].name }}</n-text>
              </div>
              <div
                v-for="(suggestItem, suggestIndex) in searchSuggestData[item]"
                :key="suggestIndex"
                class="suggest-item"
                @click="emit('toSearch', suggestItem.name, item)"
              >
                <n-text class="name">{{ suggestItem.name }}</n-text>
                <n-text v-if="suggestItem?.artist" class="artist" depth="3">
                  {{ suggestItem.artist.name }}
                </n-text>
                <n-text v-else-if="suggestItem?.artists" class="artist" depth="3">
                  {{ suggestItem.artists[0].name }}
                </n-text>
              </div>
            </div>
          </div>
        </Transition>
      </n-scrollbar>
    </n-card>
  </Transition>
</template>

<script setup lang="ts">
import { useSearchStore } from '@renderer/store'
import { watchDebounced } from '@vueuse/core'
import { ref, nextTick } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

const emit = defineEmits<{
  toSearch: [key: number | string, type: string]
}>()

watch(
  () => LocalUserDetailStore().userSource.source,
  () => {
    getSearchSuggest(SearchStore.value)
  }
)

const SearchStore = useSearchStore()

// 搜索建议数据
const searchSuggestData = ref<any>({})
const searchSuggestHeights = ref<number>(0)

// 搜索建议元素
const directSearchRef = ref<HTMLElement | null>(null)
const searchSuggestRef = ref<HTMLElement | null>(null)

// 搜索建议分类
const searchSuggestionsType = {
  songs: {
    name: '单曲',
    icon: 'Music'
  },
  artists: {
    name: '歌手',
    icon: 'Artist'
  },
  albums: {
    name: '专辑',
    icon: 'Album'
  },
  playlists: {
    name: '歌单',
    icon: 'MusicList'
  }
}

// 获取搜索建议
const getSearchSuggest = async (keywords: string) => {
  searchSuggestData.value = {}
  try {
    console.log('获取搜索建议', keywords)
    // 使用网易云音乐的搜索建议API
    const result = await window.api.music.requestSdk('tipSearch', {
      source: toRaw(LocalUserDetailStore().userSource.source || 'wy'),
      keyword: keywords
    })
    console.log('result', result)

    if (result) {
      const res = result
      // 若为纯数组则包装为分组结构，保证模板可渲染
      searchSuggestData.value = Array.isArray(res) ? { order: ['songs'], songs: res } : res
    } else {
      searchSuggestData.value = {}
    }

    // 计算高度
    nextTick(calcSearchSuggestHeights)
  } catch (error) {
    console.error('获取搜索建议失败:', error)
  }
}

// 计算高度
const calcSearchSuggestHeights = () => {
  const directSearchHeight = directSearchRef.value?.offsetHeight
  const searchSuggestionsHeight = searchSuggestRef.value?.offsetHeight
  if (directSearchHeight || searchSuggestionsHeight) {
    const totalHeight =
      (directSearchHeight || 0) +
      (searchSuggestionsHeight || 0) +
      (searchSuggestionsHeight ? 8 : 0) +
      20
    searchSuggestHeights.value = totalHeight
  } else {
    searchSuggestHeights.value = 0
  }
}

// 搜索框改变
watchDebounced(
  () => SearchStore.value,
  (val) => {
    if (!val || val === '') return
    getSearchSuggest(val)
  },
  { debounce: 300 }
)
</script>

<style lang="scss" scoped>
.search-suggest {
  position: absolute;
  left: 0;
  top: 50px;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  max-height: calc(100vh - 160px);
  z-index: 101;
  transition:
    height 0.3s ease,
    opacity 0.3s ease,
    transform 0.3s ease;
  :deep(.scrollbar) {
    max-height: calc(100vh - 160px);
    .n-scrollbar-content {
      padding: 10px;
    }
  }
  .direct {
    display: flex;
    align-items: center;
    padding: 6px;
    border-radius: 8px;
    transition: background-color 0.3s;
    cursor: pointer;
    .n-icon {
      font-size: 16px;
      margin-right: 6px;
    }
    &:hover {
      background-color: var(--n-border-color);
    }
  }
  .all-suggest {
    margin-top: 8px;
    .suggest {
      margin-bottom: 8px;
      .suggest-type {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        color: var(--td-brand-color);
        .n-icon {
          font-size: 18px;
          margin-right: 4px;
        }
        .n-text {
          color: var(--td-brand-color);
        }
      }
      .suggest-item {
        padding: 10px 14px 10px 16px;
        margin-bottom: 8px;
        border-radius: 8px;
        transition: background-color 0.3s;
        cursor: pointer;
        .name {
          white-space: normal;
        }
        .artist {
          &::before {
            content: ' - ';
          }
        }
        &:last-child {
          margin-bottom: 0;
        }
        &:hover {
          background-color: var(--n-border-color);
        }
      }
      &:last-child {
        margin-bottom: 0;
      }
    }
  }
}
/* 外层卡片下滑淡入/淡出 */
.fadeDown-enter-active,
.fadeDown-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.fadeDown-enter-from,
.fadeDown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.fadeDown-enter-to,
.fadeDown-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* 内层内容淡入/淡出（name="fade"） */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}
</style>
