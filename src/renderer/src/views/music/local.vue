<script setup lang="ts">
import { ref, computed, onMounted, toRaw } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { ChevronRightIcon, RefreshIcon } from 'tdesign-icons-vue-next'

type MusicItem = {
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string
  songmid: number | string
  img: string
  lrc: null | string
  types: string[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
  url?: string
  path?: string
}

const scanDirs = ref<string[]>([])
const songs = ref<MusicItem[]>([])
const loading = ref(false)
const matching = ref<Record<string | number, boolean>>({})
const batchState = ref({ total: 0, done: 0, running: false })
const showMatchModal = ref(false)
const matchResults = ref<any[]>([])
const matchTargetSong = ref<MusicItem | null>(null)
const sourcesOrder = ['wy', 'tx', 'kg', 'kw', 'mg']
// 保留占位，后续可扩展更多菜单
// const showMoreDropdown = ref(false)
const playlistOptions = ref<{ label: string; value: string }[]>([])
const selectedPlaylistId = ref<string>('')
const showDirModal = ref(false)
// const newDirInput = ref('')

const hasDirs = computed(() => scanDirs.value.length > 0)

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

const scanLibrary = async () => {
  if (!hasDirs.value) {
    MessagePlugin.warning('请先选择扫描目录')
    return
  }
  loading.value = true
  try {
    const api = (window as any).api
    if (!api || !api.localMusic || !api.localMusic.scan) {
      MessagePlugin.error('请在Electron应用中使用本地扫描功能')
      return
    }
    const resList = await api.localMusic.scan(toRaw(scanDirs.value))
    const list = Array.isArray(resList) ? resList : await api.localMusic.getList()
    songs.value = Array.isArray(list) ? list : []
    for (const s of songs.value) await ensureDuration(s)
  } catch (e: any) {
    console.error('本地扫描失败:', e)
    MessagePlugin.error(e?.message || '扫描失败')
  } finally {
    loading.value = false
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

const fetchPlaylists = async () => {
  const res = await (window as any).api.songList.getAll()
  const list = Array.isArray(res?.data) ? res.data : []
  const locals = list.filter((p: any) => p.source === 'local')
  if (locals.length === 0) {
    const created = await (window as any).api.songList.create(
      '本地音乐库',
      '扫描导入的本地歌曲',
      'local'
    )
    if (created?.success && created?.data?.hashId) {
      selectedPlaylistId.value = created.data.hashId
    }
  }
  const after = await (window as any).api.songList.getAll()
  const all = Array.isArray(after?.data) ? after.data : []
  const locals2 = all.filter((p: any) => p.source === 'local')
  playlistOptions.value = locals2.map((p: any) => ({ label: p.name, value: p.hashId }))
  if (!selectedPlaylistId.value && playlistOptions.value.length > 0) {
    selectedPlaylistId.value = playlistOptions.value[0].value
  }
}

const addToLocalPlaylist = async (song: MusicItem) => {
  if (!selectedPlaylistId.value) {
    await fetchPlaylists()
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
  const need = songs.value.filter((s) => !s.img || !s.singer || !s.albumName)
  if (need.length === 0) {
    MessagePlugin.warning('没有需要匹配的歌曲')
    return
  }
  batchState.value = { total: need.length, done: 0, running: true }
  for (const it of need) {
    await matchTags(it)
    batchState.value.done++
  }
  batchState.value.running = false
  MessagePlugin.success('批量匹配完成')
}

onMounted(async () => {
  fetchPlaylists()
  const saved = await (window as any).api.localMusic.getDirs()
  if (Array.isArray(saved)) scanDirs.value = saved
  const list = await (window as any).api.localMusic.getList()
  if (Array.isArray(list)) {
    songs.value = list
    console.log('本地音乐库:', songs.value)
    for (const s of songs.value) await ensureDuration(s)
  }
})
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
      <t-button
        theme="primary"
        style="padding: 6px 9px; border-radius: 8px; height: 36px"
        @click="playAll"
      >
        <span style="margin-left: 3px">播放全部</span>
        <template #icon>
          <span class="iconfont icon-bofang"></span>
        </template>
      </t-button>
      <t-button
        theme="default"
        style="padding: 6px 9px; border-radius: 8px; height: 36px; width: 36px"
        @click="scanLibrary"
      >
        <template #icon
          ><refresh-icon
            :fill-color="'transparent'"
            :stroke-color="'currentColor'"
            :stroke-width="1.5"
        /></template>
      </t-button>
      <t-button size="small" @click="addAllToPlaylist">添加全部到播放列表</t-button>
      <n-button size="small" @click="clearScan">清空所有</n-button>
      <n-button size="small" :disabled="songs.length === 0" @click="matchBatch">批量匹配</n-button>
      <!-- <n-select
        v-model:value="selectedPlaylistId"
        :options="playlistOptions"
        size="small"
        placeholder="选择本地歌单"
      /> -->
      <div v-if="batchState.running" style="margin-left: 8px; font-size: 12px; color: #999">
        {{ batchState.done }}/{{ batchState.total }}
      </div>
    </div>

    <n-modal v-model:show="showDirModal" preset="dialog" title="选择本地文件夹">
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
      <div class="row header">
        <div class="col cover">封面</div>
        <div class="col title">标题</div>
        <div class="col artist">歌手</div>
        <div class="col album">专辑</div>
        <div class="col dura">时长</div>
        <div class="col ops">操作</div>
      </div>
      <div v-for="s in songs" :key="s.songmid" class="row">
        <div class="col cover">
          <img :src="s.img || '/default-cover.png'" alt="cover" />
        </div>
        <div class="col title">{{ s.name }}</div>
        <div class="col artist">{{ s.singer }}</div>
        <div class="col album">{{ s.albumName }}</div>
        <div class="col dura">{{ s.interval || '' }}</div>
        <div class="col ops">
          <n-button-group ghost>
            <n-button size="tiny" round @click="addToPlaylistAndPlay(s)">播放</n-button>
            <n-button size="tiny" round @click="addToPlaylistEnd(s)">加入播放列表</n-button>
            <n-button size="tiny" :loading="matching[s.songmid]" round @click="openAccurateMatch(s)"
              >精准匹配</n-button
            >
            <n-button size="tiny" round @click="addToLocalPlaylist(s)">添加到本地歌单</n-button>
          </n-button-group>
        </div>
      </div>
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
  </div>
</template>

<style lang="scss" scoped>
.local-container {
  padding: 0 32px;
  height: 100%;
  display: flex;
  flex-direction: column;
  .local-header {
    height: 70px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    .left-container {
      gap: 8px;
      .title {
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
  gap: 8px;
  margin-bottom: 12px;
}
.dir-tag {
  max-width: 360px;
}
.list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}
.row {
  display: grid;
  grid-template-columns: 70px 1fr 1fr 1fr 90px 360px;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
}
.row.header {
  font-weight: 600;
}
.col.cover img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}
.empty {
  padding: 24px;
  color: #999;
}
</style>
