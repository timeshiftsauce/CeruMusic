<template>
  <Transition
    name="fadeDown"
    mode="out-in"
    @after-enter="calcSearchSuggestHeights"
    @after-leave="calcSearchSuggestHeights"
  >
    <n-card
      v-if="SearchStore.focus && (SearchStore.value || SearchStore.history.length)"
      class="search-suggest"
      @mousedown.prevent
      content-style="padding: 0"
      :style="{
        height: `${searchSuggestHeights}px`,
        border: searchSuggestHeights === 0 ? 'none' : null
      }"
    >
      <n-scrollbar class="scrollbar">
        <!-- 直接搜索 -->
        <div
          v-if="SearchStore.value"
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
            v-if="SearchStore.value && groups.length"
            ref="searchSuggestRef"
            class="all-suggest"
          >
            <div v-for="(group, index) in groups" :key="index" class="suggest">
              <div class="suggest-type">
                <SvgIcon :name="searchSuggestionsType[group.kind].icon" />
                <n-text>{{ searchSuggestionsType[group.kind].name }}</n-text>
              </div>
              <div
                v-for="(suggestItem, suggestIndex) in group.items"
                :key="suggestIndex"
                class="suggest-item"
                @click="emit('toSearch', suggestItem.name, group.kind)"
              >
                <n-text class="name">{{ suggestItem.name }}</n-text>
                <n-text v-if="suggestItem.artist" class="artist" depth="3">
                  {{ suggestItem.artist }}
                </n-text>
              </div>
            </div>
          </div>
        </Transition>
        <!-- 搜索历史(输入为空时展示) -->
        <div v-if="!SearchStore.value" ref="historyRef" class="search-history">
          <div class="history-header">
            <n-text depth="3">搜索历史</n-text>
            <n-text depth="3" class="clear" @click="SearchStore.clearHistory()">清除</n-text>
          </div>
          <div
            v-for="item in SearchStore.history"
            :key="item"
            class="history-item"
            @click="emit('toSearch', item, 'keyword')"
          >
            <n-text class="name">{{ item }}</n-text>
          </div>
        </div>
      </n-scrollbar>
    </n-card>
  </Transition>
</template>

<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { useSearchStore } from '@renderer/store'
import { computed, ref, nextTick, watch } from 'vue'
import { interceptsSuggestions } from '@renderer/plugin/operations'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

const emit = defineEmits<{
  toSearch: [key: number | string, type: string]
}>()

const SearchStore = useSearchStore()
const user = LocalUserDetailStore()

// 搜索建议数据
type Kind = keyof typeof searchSuggestionsType
interface Suggestion {kind:Kind; name:string; artist?:string}
const suggestions = ref<Suggestion[]>([])
const groups = computed(() => {
  const grouped: {kind:Kind;items:Suggestion[]}[] = []
  for (const item of suggestions.value) {
    const last = grouped[grouped.length - 1]
    if (last?.kind === item.kind) last.items.push(item)
    else grouped.push({kind:item.kind,items:[item]})
  }
  return grouped
})
const searchSuggestHeights = ref<number>(0)

// 搜索建议元素
const directSearchRef = ref<HTMLElement | null>(null)
const searchSuggestRef = ref<HTMLElement | null>(null)
// 搜索历史元素
const historyRef = ref<HTMLElement | null>(null)

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
function displayItems(raw:any):Suggestion[] {
  const source = Array.isArray(raw) ? {order:['songs'],songs:raw} : raw
  const rows:Suggestion[] = []
  for (const kind of Array.isArray(source?.order) ? source.order : []) {
    if (!Object.hasOwn(searchSuggestionsType,kind) || !Array.isArray(source[kind])) continue
    for (const value of source[kind]) {
      const name = typeof value === 'string' ? value : value?.name
      if (typeof name !== 'string' || !name.trim() || name.length > 512) continue
      const artist = value?.artist?.name ?? value?.artists?.[0]?.name
      rows.push({kind,name,...(typeof artist==='string'?{artist}:{})})
      if (rows.length === 100) return rows
    }
  }
  return rows
}

// 计算高度
const calcSearchSuggestHeights = () => {
  const directSearchHeight = directSearchRef.value?.offsetHeight
  const searchSuggestionsHeight = searchSuggestRef.value?.offsetHeight
  const searchHistoryHeight = historyRef.value?.offsetHeight
  if (directSearchHeight || searchSuggestionsHeight || searchHistoryHeight) {
    const totalHeight =
      (directSearchHeight || 0) +
      (searchSuggestionsHeight || 0) +
      (searchSuggestionsHeight ? 8 : 0) +
      (searchHistoryHeight || 0) +
      20
    searchSuggestHeights.value = totalHeight
  } else {
    searchSuggestHeights.value = 0
  }
}

// 聚焦/输入内容/历史变化时重新计算卡片高度(空输入时内容块会整体换成搜索历史)
watch([() => SearchStore.focus, () => !!SearchStore.value, () => SearchStore.history.length], () =>
  nextTick(calcSearchSuggestHeights)
)

// 搜索框改变
watch([() => SearchStore.value, () => SearchStore.focus, () => user.userSource], ([query, focused, selected], _, onCleanup) => {
  suggestions.value = []
  void nextTick(calcSearchSuggestHeights)
  if (!focused || !query.trim() || query.length > 4096 || !selected.source) return
  let active = true
  const timer = setTimeout(async () => {
    let rows:Suggestion[] = []
    try {
      rows = displayItems(await desktopBridge.api.music.requestSdk('tipSearch',{source:selected.source,keyword:query}))
      if (active && interceptsSuggestions()) {
        const names = await desktopBridge.api.plugins.searchSuggest({query,items:rows.map(row=>row.name)})
        const remaining = [...rows]
        rows = names.map(name => {
          const index = remaining.findIndex(row => row.name === name)
          return index < 0 ? {kind:'songs',name} : remaining.splice(index,1)[0]
        })
      }
    } catch (error) { console.warn('获取搜索建议失败:',error) }
    if (active) { suggestions.value=rows; void nextTick(calcSearchSuggestHeights) }
  },300)
  onCleanup(()=>{active=false;clearTimeout(timer)})
}, {deep:true,flush:'sync'})
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
  .search-history {
    .history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px;
      .clear {
        cursor: pointer;
        transition: color 0.3s;
        &:hover {
          color: var(--td-brand-color);
        }
      }
    }
    .history-item {
      display: flex;
      align-items: center;
      padding: 8px 6px;
      border-radius: 8px;
      transition: background-color 0.3s;
      cursor: pointer;
      .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      &:hover {
        background-color: var(--n-border-color);
      }
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
