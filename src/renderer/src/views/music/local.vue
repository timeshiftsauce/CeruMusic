<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, toRaw } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  ChevronRightIcon,
  RefreshIcon,
  EllipsisIcon,
  PlayCircleIcon,
  AddIcon,
  SearchIcon,
  FolderIcon
} from 'tdesign-icons-vue-next'
import ContextMenu from '@renderer/components/ContextMenu/ContextMenu.vue'
import { createMenuItem } from '@renderer/components/ContextMenu/utils'
import SongVirtualList from '@renderer/components/Music/SongVirtualList.vue'
import LocalTagEditor from '@renderer/components/Music/LocalTagEditor.vue'
import { useRouter } from 'vue-router'

type MusicItem = {
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string
  songmid: number | string
  img?: string
  hasCover?: boolean
  coverKey?: string
  lrc: null | string
  types: string[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
  url?: string
  path?: string
  bitrate?: number
  sampleRate?: number
  channels?: number
}

const scanDirs = ref<string[]>([])
const songs = ref<MusicItem[]>([])
const loading = ref(false)
const matching = ref<Record<string | number, boolean>>({})
const batchState = ref({ total: 0, done: 0, running: false })
const scanProgress = ref({ processed: 0, total: 0, running: false })
const showMatchModal = ref(false)
const matchResults = ref<any[]>([])
const matchTargetSong = ref<MusicItem | null>(null)
const sourcesOrder = ['wy', 'tx', 'kg', 'kw', 'mg']
// 保留占位，后续可扩展更多菜单
// const showMoreDropdown = ref(false)
const selectedPlaylistId = ref<string>('')
const showDirModal = ref(false)
// const newDirInput = ref('')
const router = useRouter()

const hasDirs = computed(() => scanDirs.value.length > 0)
const multiSelect = ref(false)
const searchQuery = ref('')
const displaySongs = computed(() => {
  const q = (searchQuery.value || '').trim().toLowerCase()
  if (!q) return songs.value
  const includes = (s: string | undefined) => !!s && s.toLowerCase().includes(q)
  return songs.value.filter((s) => includes(s.name) || includes(s.singer) || includes(s.albumName))
})
const moreActions = ref([
  {
    label: '添加全部到播放列表',
    key: 'add-to-playlist'
  },
  {
    label: '清空所有',
    key: 'clear'
  },
  {
    label: '批量匹配标签',
    key: 'batch-batch'
  },
  {
    label: '批量选择',
    key: 'toggle-multi'
  }
])
const moreActionSelect = (e: 'add-to-playlist' | 'clear' | 'batch-batch' | 'toggle-multi') => {
  switch (e) {
    case 'add-to-playlist':
      addAllToPlaylist()
      break
    case 'clear':
      clearScan()
      break
    case 'batch-batch':
      matchBatch()
      break
    case 'toggle-multi':
      multiSelect.value = !multiSelect.value
      break
  }
}

const selectDirs = async () => {
  const dirs = await (window as any).api.localMusic.selectDirs()
  if (Array.isArray(dirs)) {
    scanDirs.value = Array.from(new Set([...(scanDirs.value || []), ...dirs]))
  }
  showDirModal.value = true
}

const saveDirs = async () => {
  await (window as any).api.localMusic.setDirs(toRaw(scanDirs.value))
  showDirModal.value = false
  MessagePlugin.success('目录已保存')
}

const removeDir = (d: string) => {
  const arr = Array.isArray(scanDirs.value) ? scanDirs.value : []
  scanDirs.value = arr.filter((x) => x !== d)
}

const clearScan = async () => {
  const api = (window as any).api
  if (!api?.localMusic?.clearIndex) return
  const res = await api.localMusic.clearIndex()
  if (res?.success) {
    songs.value = []
    MessagePlugin.success('已清空扫描索引')
  } else {
    MessagePlugin.error('清空失败')
  }
}

const formatTime = (sec: number) => {
  if (!sec || !isFinite(sec)) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const ensureDuration = async (song: MusicItem) => {
  if (song.interval) return
  if (!song.url) return
  const audio = new Audio()
  audio.src = song.url
  const p = new Promise<void>((resolve) => {
    audio.addEventListener('loadedmetadata', () => {
      const d = audio.duration
      song.interval = formatTime(d)
      resolve()
    })
    audio.addEventListener('error', () => resolve())
  })
  await p
}

const parseIntervalToSec = (interval?: string) => {
  if (!interval) return 0
  const mm = parseInt(interval.split(':')[0])
  const ss = parseInt(interval.split(':')[1])
  return mm * 60 + ss
}

const rankCandidate = (song: MusicItem, it: any) => {
  const nameScore = strSim(it.name || '', (song.name || '').trim())
  const artistScore = strSim((it.singer || '').trim(), (song.singer || '').trim())
  const targetSec = parseIntervalToSec(song.interval)
  const its = Number(it.interval || 0)
  let durationScore = 0
  if (targetSec > 0 && its > 0) {
    const diff = Math.abs(its - targetSec)
    durationScore = diff <= 2 ? 1 : diff <= 5 ? 0.6 : diff <= 10 ? 0.3 : 0
  }
  return nameScore * 0.6 + durationScore * 0.3 + artistScore * 0.1
}

const searchAcrossSources = async (keyword: string) => {
  const api = (window as any).api
  const resAll: any[] = []
  for (const src of sourcesOrder) {
    try {
      const res = await api.music.requestSdk('search', {
        source: src,
        keyword,
        page: 1,
        limit: 20
      })
      if (Array.isArray(res?.list)) {
        for (const it of res.list) resAll.push({ ...it, source: src })
      }
    } catch {}
  }
  return resAll
}

const pickBestMatch = async (song: MusicItem) => {
  await ensureDuration(song)
  const keyword =
    song.name ||
    song.path
      ?.split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '') ||
    ''
  const all = await searchAcrossSources(keyword)
  let best: any = null
  let bestScore = 0
  for (const it of all) {
    const score = rankCandidate(song, it)
    if (score > bestScore) {
      bestScore = score
      best = it
    }
    if (bestScore >= 0.9) break
  }
  return { best, bestScore, all }
}

const openAccurateMatch = async (song: MusicItem) => {
  matching.value[song.songmid] = true
  try {
    const { all } = await pickBestMatch(song)
    matchResults.value = all
    matchTargetSong.value = song
    showMatchModal.value = true
  } finally {
    matching.value[song.songmid] = false
  }
}

const applyMatch = async (candidate: any) => {
  const song = matchTargetSong.value
  if (!song) return
  try {
    let pic = candidate.img
    if (!pic) {
      const p = await (window as any).api.music.requestSdk('getPic', {
        source: candidate.source,
        songInfo: candidate
      })
      if (typeof p !== 'object') pic = p
    }
    const writeRes = await (window as any).api.localMusic.writeTags(
      song.path,
      {
        name: candidate.name,
        singer: candidate.singer,
        albumName: candidate.albumName,
        lrc: null,
        img: pic,
        source: candidate.source
      },
      { cover: true, lyrics: false }
    )
    if (writeRes?.success) {
      song.name = candidate.name
      song.singer = candidate.singer
      song.albumName = candidate.albumName
      song.img = pic || song.img
      MessagePlugin.success('已应用匹配结果')
      showMatchModal.value = false
    } else {
      MessagePlugin.error(writeRes?.message || '写入失败')
    }
  } catch (e: any) {
    MessagePlugin.error(e?.message || '匹配失败')
  }
}

const playAll = () => {
  if (songs.value.length === 0) return
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('replacePlaylist', toRaw(songs.value) as any)
  }
}

const addAllToPlaylist = () => {
  if (songs.value.length === 0) return
  if ((window as any).musicEmitter) {
    for (const s of songs.value) {
      ;(window as any).musicEmitter.emit('addToPlaylistEnd', toRaw(s) as any)
    }
    MessagePlugin.success('已将全部加入播放列表')
  }
}

const replacePlaylist = (songsToReplace: MusicItem[], shouldShuffle = false) => {
  if (!(window as any).musicEmitter) {
    MessagePlugin.error('播放器未初始化')
    return
  }
  let finalSongs: any[] = toRaw(songsToReplace)
  if (shouldShuffle) {
    const idx = Array.from({ length: finalSongs.length }, (_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    finalSongs = idx.map((i) => songsToReplace[i])
  }
  const replaceData = finalSongs.map((song) => toRaw(song))
  ;(window as any).musicEmitter.emit('replacePlaylist', replaceData)
  MessagePlugin.success('批量歌曲已加入播放')
}

const scanLibrary = async () => {
  if (!hasDirs.value) {
    MessagePlugin.warning('请先选择扫描目录')
    return
  }
  if (scanProgress.value.running) {
    MessagePlugin.warning('扫描正在进行中…')
    return
  }
  loading.value = true
  scanProgress.value = { processed: 0, total: 0, running: true }
  try {
    const api = (window as any).api
    if (!api || !api.localMusic || !api.localMusic.scan) {
      MessagePlugin.error('请在Electron应用中使用本地扫描功能')
      return
    }
    // clearScan()
    await api.localMusic.scan(toRaw(scanDirs.value))
  } catch (e: any) {
    console.error('本地扫描失败:', e)
    MessagePlugin.error(e?.message || '扫描失败')
  } finally {
    loading.value = false
    scanProgress.value.running = false
  }
}

const addToPlaylistAndPlay = (song: MusicItem) => {
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('addToPlaylistAndPlay', toRaw(song) as any)
  }
}

const addToPlaylistEnd = (song: MusicItem) => {
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('addToPlaylistEnd', toRaw(song) as any)
  }
}

const handlePlay = (song: MusicItem) => {
  addToPlaylistAndPlay(song)
}

// 右键菜单
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuSong = ref<MusicItem | null>(null)
const contextMenuItems = computed(() => {
  const items = [
    createMenuItem('play', '播放', {
      icon: PlayCircleIcon,
      onClick: () => {
        if (contextMenuSong.value) handlePlay(contextMenuSong.value)
      }
    }),
    createMenuItem('addToPlaylist', '加入播放列表', {
      icon: AddIcon,
      onClick: () => {
        if (contextMenuSong.value) addToPlaylistEnd(contextMenuSong.value)
      }
    }),
    createMenuItem('accurateMatch', '精准匹配', {
      icon: SearchIcon,
      onClick: () => {
        if (contextMenuSong.value) openAccurateMatch(contextMenuSong.value)
      }
    }),
    createMenuItem('editTags', '编辑标签', {
      icon: AddIcon,
      onClick: () => {
        if (contextMenuSong.value) openTagEditor(contextMenuSong.value)
      }
    }),
    createMenuItem('addToLocalPlaylist', '添加到本地歌单', {
      icon: FolderIcon,
      onClick: () => {
        if (contextMenuSong.value) addToLocalPlaylist(contextMenuSong.value)
      }
    })
  ]
  return items
})

const closeContextMenu = () => {
  contextMenuVisible.value = false
  contextMenuSong.value = null
}

const addToLocalPlaylist = async (song: MusicItem) => {
  if (!selectedPlaylistId.value) {
    if (!selectedPlaylistId.value) {
      MessagePlugin.error('无法获取本地歌单')
      return
    }
  }
  const res = await (window as any).api.songList.addSongs(selectedPlaylistId.value, [song])
  if (res?.success) MessagePlugin.success('已添加到本地歌单')
  else MessagePlugin.error(res?.error || '添加失败')
}

const strSim = (a: string, b: string) => {
  const x = a.toLowerCase().replace(/\s+/g, '')
  const y = b.toLowerCase().replace(/\s+/g, '')
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.8
  return 0
}

const matchTags = async (song: MusicItem) => {
  if (!song || !song.path) return
  matching.value[song.songmid] = true
  try {
    const { best } = await pickBestMatch(song)
    if (!best) {
      MessagePlugin.warning('未匹配到合适标签')
      return
    }
    await applyMatch(best)
  } finally {
    matching.value[song.songmid] = false
  }
}

const matchBatch = async () => {
  const need = songs.value.filter(
    (s) =>
      !s.hasCover || !s.singer || !s.albumName || s.singer === '未知艺术家' || s.name === '未知曲目'
  )
  if (need.length === 0) {
    MessagePlugin.warning('没有需要匹配的歌曲')
    return
  }
  batchState.value = { total: need.length, done: 0, running: true }
  try {
    const ids = need.map((s) => String(s.songmid))
    await (window as any).api.localMusic.batchMatch(ids)
  } catch (e: any) {
    MessagePlugin.error('启动匹配失败: ' + e.message)
    batchState.value.running = false
  }
}

onMounted(async () => {
  const saved = await (window as any).api.localMusic.getDirs()
  if (Array.isArray(saved)) scanDirs.value = saved
  const list = await (window as any).api.localMusic.getList()
  if (Array.isArray(list)) {
    songs.value = list
    console.log('本地音乐库:', { ...toRaw(songs.value) })
    for (const s of songs.value) await ensureDuration(s)
  }

  // 监听扫描进度
  window.api.localMusic.onScanProgress((processed: number, total: number) => {
    scanProgress.value = { processed, total, running: true }
  })

  // 监听扫描完成
  window.api.localMusic.onScanFinished((resList: any[]) => {
    songs.value = Array.isArray(resList) ? resList : []
    for (const s of songs.value) ensureDuration(s)
    scanProgress.value.running = false
    loading.value = false
  })

  // 监听批量匹配进度
  window.api.localMusic.onBatchMatchProgress((processed: number, total: number) => {
    batchState.value = { total, done: processed, running: true }
  })

  window.api.localMusic.onBatchMatchFinished(async (res: any) => {
    batchState.value.running = false
    MessagePlugin.success(`批量匹配完成，成功匹配 ${res.matched} 首`)
    const list = await (window as any).api.localMusic.getList()
    if (Array.isArray(list)) {
      songs.value = list
      for (const s of songs.value) ensureDuration(s)
    }
  })
})

onBeforeUnmount(() => {
  window.api.localMusic.removeScanProgress()
  window.api.localMusic.removeScanFinished()
  window.api.localMusic.removeBatchMatchListeners()
})

async function coverLoader(song: MusicItem, signal: AbortSignal) {
  if (signal.aborted) return ''
  if (song?.hasCover === false) return ''
  const data = await (window as any).api.localMusic.getCoverBase64(String(song.songmid))
  if (signal.aborted) return ''
  if (data) {
    song.hasCover = true
    return data
  } else {
    song.hasCover = false
    return ''
  }
}

const showTagEditor = ref(false)
const tagEditorSong = ref<MusicItem | null>(null)
function openTagEditor(song: MusicItem) {
  // tagEditorSong.value = song
  // showTagEditor.value = true
  router.push({
    name: 'local-tag-editor',
    query: { id: song.songmid }
  })
}
function onEditorSaved(payload: any) {
  if (!tagEditorSong.value) return
  tagEditorSong.value.name = payload.name || tagEditorSong.value.name
  tagEditorSong.value.singer = payload.singer || tagEditorSong.value.singer
  tagEditorSong.value.albumName = payload.albumName || tagEditorSong.value.albumName
  tagEditorSong.value.lrc = payload.lrc || tagEditorSong.value.lrc
  if (payload.img) {
    tagEditorSong.value.img = payload.img
    tagEditorSong.value.hasCover = true
  }
}
const extraMenuFactory = (song: MusicItem) => {
  void song
  return [{ key: 'editTags', label: '编辑标签' }]
}
function onExtraMenuClick(e: any) {
  if (!e) return
  const { key, song } = e
  if (key === 'editTags') openTagEditor(song)
}

function handleAddBatchToSongList(batchSongs: MusicItem[], playlist: any) {
  if (!batchSongs || batchSongs.length === 0) {
    MessagePlugin.warning('未选择歌曲')
    return
  }
  window.api.songList
    .addSongs(
      playlist.id,
      batchSongs.map((s) => toRaw(s) as any)
    )
    .then((res: any) => {
      if (res?.success) {
        MessagePlugin.success(`已添加 ${batchSongs.length} 首到歌单"${playlist.name}"`)
      } else {
        MessagePlugin.error(res?.error || '添加到歌单失败')
      }
    })
    .catch((err: any) => {
      MessagePlugin.error(err?.message || '添加到歌单失败')
    })
}
</script>

<template>
  <div class="local-container">
    <div class="local-header">
      <div class="left-container">
        <h2 class="title">
          本地音乐库<span style="font-size: 12px; color: #999">共 {{ songs.length }} 首</span>
        </h2>
      </div>
      <div class="right-container">
        <t-button shape="round" theme="primary" variant="text" @click="showDirModal = true">
          <span style="display: flex; align-items: center"
            ><span style="font-weight: bold">选择目录</span>
            <chevron-right-icon
              :fill-color="'transparent'"
              :stroke-color="'currentColor'"
              :stroke-width="2.5"
          /></span>
        </t-button>
      </div>
    </div>
    <div class="controls">
      <t-button theme="primary" class="local-btn play-all" @click="playAll">
        <span style="margin-left: 3px">播放全部</span>
        <template #icon>
          <span class="iconfont icon-bofang"></span>
        </template>
      </t-button>
      <t-button theme="default" class="local-btn scan" @click="scanLibrary">
        <template #icon
          ><refresh-icon
            :fill-color="'transparent'"
            :stroke-color="'currentColor'"
            :stroke-width="1.5"
        /></template>
      </t-button>
      <n-dropdown
        trigger="hover"
        :options="moreActions"
        placement="right-start"
        @select="moreActionSelect"
      >
        <t-button theme="default" class="local-btn more">
          <template #icon>
            <ellipsis-icon :stroke-width="1.5" />
          </template>
        </t-button>
      </n-dropdown>
      <!-- <t-button size="small" @click="addAllToPlaylist">添加全部到播放列表</t-button>
      <n-button size="small" @click="clearScan">清空所有</n-button>
      <n-button size="small" :disabled="songs.length === 0" @click="matchBatch">批量匹配</n-button> -->
      <!-- <n-select
        v-model:value="selectedPlaylistId"
        :options="playlistOptions"
        size="small"
        placeholder="选择本地歌单"
      /> -->
      <div v-if="batchState.running" style="margin-left: 8px; font-size: 12px; color: #999">
        {{ batchState.done }}/{{ batchState.total }}
      </div>
      <div v-if="scanProgress.running" style="margin-left: 8px; font-size: 12px; color: #999">
        <t-loading size="small" />
        扫描中... {{ scanProgress.processed }}/{{ scanProgress.total }}
      </div>
      <div style="margin-left: auto; display: flex; align-items: center">
        <n-input
          v-model:value="searchQuery"
          clearable
          placeholder="搜索本地歌曲/歌手/专辑"
          style="width: 260px"
        >
          <template #prefix>
            <SearchIcon size="16" />
          </template>
        </n-input>
      </div>
    </div>

    <n-modal
      v-model:show="showDirModal"
      preset="dialog"
      title="选择本地文件夹"
      style="--n-border-radius: 10px; padding: 20px 30px"
    >
      <div>
        <div style="margin-bottom: 10px; color: #666; font-size: 12px">
          你可以添加常用目录，文件将即时索引。
        </div>
        <div
          v-for="d in scanDirs"
          :key="d"
          style="display: flex; justify-content: space-between; align-items: center; margin: 10px 0"
        >
          <span>{{ d }}</span>
          <n-button size="tiny" @click="removeDir(d)">删除</n-button>
        </div>
        <div
          style="
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 20px;
            gap: 8px;
          "
        >
          <n-button class="flex" style="width: 46%" round @click="selectDirs">添加文件夹</n-button>
          <div class="flex" style="width: 8%"></div>
          <n-button class="flex" style="width: 46%" round type="primary" @click="saveDirs"
            >确认</n-button
          >
        </div>
      </div>
    </n-modal>

    <div v-if="songs.length > 0" class="list">
      <SongVirtualList
        style="flex: 1; min-height: 0; border-radius: 6px; overflow: hidden"
        :songs="displaySongs as any"
        :show-index="true"
        :show-album="true"
        :show-duration="true"
        :buffer-size="10"
        :cover-concurrency="30"
        :cover-loader="coverLoader as any"
        :extra-menu-factory="extraMenuFactory as any"
        :hide-local-source="true"
        :enable-download="false"
        :multi-select="multiSelect"
        @play="(s: any) => handlePlay(s)"
        @add-to-playlist="(s: any) => addToPlaylistEnd(s)"
        @play-batch="(list: any[]) => replacePlaylist(list as any, false)"
        @add-to-song-list-batch="
          (list: any[], playlist: any) => handleAddBatchToSongList(list as any, playlist)
        "
        @exit-multi-select="() => (multiSelect = false)"
        @extra-menu-click="onExtraMenuClick"
        @scroll="() => {}"
      />
    </div>
    <div v-else class="empty">暂无数据，点击选择目录后扫描</div>

    <n-modal v-model:show="showMatchModal" preset="dialog" title="选择匹配结果">
      <div style="max-height: 60vh; overflow: auto">
        <div
          v-for="it in matchResults"
          :key="(it.id || it.songId) + '_' + it.source"
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border: 1px solid #eee;
            border-radius: 6px;
            margin: 6px 0;
          "
        >
          <div style="display: flex; align-items: center; gap: 10px">
            <img
              :src="it.img || '/default-cover.png'"
              style="width: 40px; height: 40px; border-radius: 4px"
            />
            <div>
              <div style="font-weight: 500">
                {{ it.name
                }}<span style="margin-left: 8px; color: #999; font-size: 12px">{{
                  it.source.toUpperCase()
                }}</span>
              </div>
              <div style="font-size: 12px; color: #666">{{ it.singer }} · {{ it.albumName }}</div>
            </div>
          </div>
          <n-button size="tiny" type="primary" @click="applyMatch(it)">使用该结果</n-button>
        </div>
      </div>
    </n-modal>

    <ContextMenu
      v-model:visible="contextMenuVisible"
      :position="contextMenuPosition"
      :items="contextMenuItems"
      @close="closeContextMenu"
    />

    <LocalTagEditor v-model:show="showTagEditor" :song="tagEditorSong" @saved="onEditorSaved" />
  </div>
</template>

<style lang="scss" scoped>
.local-container {
  padding: 0 32px;
  padding-top: 1rem;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  .local-header {
    // height: 70px;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    .left-container {
      gap: 8px;
      .title {
        border-left: 8px solid var(--td-brand-color-3);
        padding-left: 12px;
        border-radius: 8px;
        line-height: 1.5em;
        font-size: 28px;
        font-weight: 900;
        span {
          padding-left: 8px;
          font-size: 18px;
        }
      }
    }
  }
}
.controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  .local-btn {
    padding: 6px 9px;
    border-radius: 8px;
    height: 36px;
  }
}
.dir-tag {
  max-width: 360px;
}
.list {
  margin-top: 0px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: grid;
  grid-template-columns: 70px 1fr 1fr 1fr 90px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  position: relative;
}
.row.header {
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--song-list-header-bg, #fff);
  border-bottom: 1px solid var(--song-list-header-border, #eee);
}
.row:not(.header):hover {
  background: var(--song-list-item-hover, rgba(0, 0, 0, 0.04));
}

.row:not(.header) .col.cover {
  // width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  // height: 40px;
}
.col.cover img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
}
.row-loading {
  position: absolute;
  right: 20px;
  top: 17px;
  // transform: translate(-50%, -50%);
  pointer-events: none;
}
.empty {
  padding: 24px;
  color: #999;
}
</style>
