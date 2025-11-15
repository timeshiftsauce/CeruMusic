<script setup lang="ts">
import { ref, computed, onMounted, toRaw } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

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
const playlistOptions = ref<{ label: string; value: string }[]>([])
const selectedPlaylistId = ref<string>('')
const showDirModal = ref(false)
const newDirInput = ref('')

const hasDirs = computed(() => scanDirs.value.length > 0)

const selectDirs = async () => {
  const dirs = await (window as any).api.localMusic.selectDirs()
  if (Array.isArray(dirs)) {
    scanDirs.value = Array.from(new Set([...(scanDirs.value || []), ...dirs]))
  }
}

const saveDirs = async () => {
  await (window as any).api.localMusic.setDirs(toRaw(scanDirs.value))
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
    await ensureDuration(song)
    const keyword =
      song.name ||
      song.path
        ?.split(/[\\/]/)
        .pop()
        ?.replace(/\.[^.]+$/, '')
    const sources = ['wy', 'tx', 'kg']
    let best: any = null
    let bestScore = 0
    for (const src of sources) {
      const res = await (window as any).api.music.requestSdk('search', {
        source: src,
        keyword,
        page: 1,
        limit: 20
      })
      if (Array.isArray(res?.list)) {
        for (const it of res.list) {
          const nameScore = strSim(it.name || '', keyword || '')
          let durationScore = 0
          if (song.interval) {
            const mm = parseInt(song.interval.split(':')[0])
            const ss = parseInt(song.interval.split(':')[1])
            const sec = mm * 60 + ss
            const its = Number(it.interval || 0)
            const diff = Math.abs(its - sec)
            durationScore = diff <= 2 ? 1 : diff <= 5 ? 0.6 : 0
          }
          const score = nameScore * 0.7 + durationScore * 0.3
          if (score > bestScore) {
            bestScore = score
            best = { ...it, source: src }
          }
        }
      }
      if (bestScore >= 0.85) break
    }
    if (!best) {
      MessagePlugin.warning('未匹配到合适标签')
      return
    }
    let pic = best.img
    if (!pic) {
      const p = await (window as any).api.music.requestSdk('getPic', {
        source: best.source,
        songInfo: best
      })
      if (typeof p !== 'object') pic = p
    }
    const writeRes = await (window as any).api.localMusic.writeTags(
      song.path,
      {
        name: best.name,
        singer: best.singer,
        albumName: best.albumName,
        lrc: null,
        img: pic,
        source: best.source
      },
      { cover: true, lyrics: false }
    )
    if (writeRes?.success) {
      song.name = best.name
      song.singer = best.singer
      song.albumName = best.albumName
      song.img = pic || song.img
      MessagePlugin.success('标签已写入')
    } else {
      MessagePlugin.error(writeRes?.message || '写入失败')
    }
  } finally {
    matching.value[song.songmid] = false
  }
}

const matchBatch = async () => {
  const need = songs.value.filter((s) => !s.img || !s.singer || !s.albumName)
  for (const it of need) {
    await matchTags(it)
  }
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
    <n-card title="本地音乐库" size="medium">
      <div class="controls">
        <n-button type="primary" size="small" @click="showDirModal = true">目录管理</n-button>
        <n-button size="small" :disabled="!hasDirs || loading" @click="scanLibrary"
          >重新扫描</n-button
        >
        <n-tag v-for="d in scanDirs" :key="d" type="default" class="dir-tag">{{ d }}</n-tag>
        <n-input
          v-model:value="newDirInput"
          size="small"
          placeholder="输入路径或点击选择..."
          style="max-width: 280px"
        />
        <n-button size="small" @click="selectDirs">选择</n-button>
        <n-button
          size="small"
          @click="
            () => {
              if (newDirInput) {
                scanDirs.value = Array.from(new Set([...(scanDirs.value || []), newDirInput]))
                newDirInput = ''
              }
            }
          "
          >添加</n-button
        >
        <n-button size="small" @click="saveDirs">保存目录</n-button>
        <n-button size="small" :disabled="songs.length === 0" @click="matchBatch"
          >批量匹配缺失标签</n-button
        >
        <n-button size="small" @click="clearScan">清空扫描</n-button>
        <n-select
          v-model:value="selectedPlaylistId"
          :options="playlistOptions"
          size="small"
          placeholder="选择本地歌单"
        />
      </div>

      <n-modal v-model:show="showDirModal" preset="dialog" title="音乐目录管理">
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px">
          <n-input v-model:value="newDirInput" placeholder="输入路径或点击选择..." />
          <n-button @click="selectDirs">选择</n-button>
          <n-button
            @click="
              () => {
                if (newDirInput) {
                  scanDirs.value = Array.from(new Set([...(scanDirs.value || []), newDirInput]))
                  newDirInput = ''
                }
              }
            "
            >添加</n-button
          >
        </div>
        <div>
          <div
            v-for="d in scanDirs"
            :key="d"
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin: 6px 0;
            "
          >
            <span>{{ d }}</span>
            <n-button size="tiny" @click="removeDir(d)">删除</n-button>
          </div>
          <div style="margin-top: 10px; display: flex; gap: 8px">
            <n-button type="primary" @click="saveDirs">保存</n-button>
            <n-button @click="scanLibrary">重新扫描</n-button>
            <n-button @click="clearScan">清空扫描</n-button>
          </div>
        </div>
      </n-modal>

      <div class="list" v-if="songs.length > 0">
        <div class="row header">
          <div class="col cover">封面</div>
          <div class="col title">标题</div>
          <div class="col artist">歌手</div>
          <div class="col album">专辑</div>
          <div class="col dura">时长</div>
          <div class="col ops">操作</div>
        </div>
        <div class="row" v-for="s in songs" :key="s.songmid">
          <div class="col cover">
            <img :src="s.img || '/default-cover.png'" alt="cover" />
          </div>
          <div class="col title">{{ s.name }}</div>
          <div class="col artist">{{ s.singer }}</div>
          <div class="col album">{{ s.albumName }}</div>
          <div class="col dura">{{ s.interval || '' }}</div>
          <div class="col ops">
            <n-button size="tiny" @click="addToPlaylistAndPlay(s)">播放</n-button>
            <n-button size="tiny" @click="addToPlaylistEnd(s)">加入播放列表</n-button>
            <n-button size="tiny" :loading="matching[s.songmid]" @click="matchTags(s)"
              >匹配标签</n-button
            >
            <n-button size="tiny" @click="addToLocalPlaylist(s)">添加到本地歌单</n-button>
          </div>
        </div>
      </div>
      <div v-else class="empty">暂无数据，点击选择目录后扫描</div>
    </n-card>
  </div>
</template>

<style scoped>
.local-container {
  padding: 16px;
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
  display: flex;
  flex-direction: column;
  gap: 8px;
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
