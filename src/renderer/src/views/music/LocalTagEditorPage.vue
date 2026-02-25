<script setup lang="ts">
import { ref, reactive, toRaw } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { SearchIcon } from 'tdesign-icons-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { convertLrcFormat, convertToStandardLrc } from '@renderer/utils/lrcParser'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const songPath = ref('')
const songMid = ref('')
const activeTab = ref('edit')
const loading = ref(false)
const saving = ref(false)

const formModel = reactive({
  name: '',
  singer: '',
  albumName: '',
  year: '',
  genre: '',
  lrc: '',
  img: ''
})

const searchKeyword = ref('')
const searchResults = ref<any[]>([])
const searching = ref(false)
const showLyricChoice = ref(false)
const lyricChoiceData = ref<{ standard: string; wordByWord: string } | null>(null)

const handleBack = () => {
  router.back()
}

onActivated(async () => {
  const mid = route.query.id as string
  if (!mid) {
    message.error('参数错误')
    router.back()
    return
  }
  songMid.value = mid

  try {
    const api = (window as any).api
    // Get basic info including path from list (or fetch by id if needed)
    // Here we assume we can fetch by id or need to pass path.
    // Ideally we fetch full info by ID
    const songList = await api.localMusic.getList()
    const song = songList.find((s: any) => s.songmid === mid)

    if (song) {
      songPath.value = song.path
      formModel.name = song.name || ''
      formModel.singer = song.singer || ''
      formModel.albumName = song.albumName || ''
      formModel.year = song.year || ''
      formModel.genre = song.genre || ''
      formModel.img = song.img || ''

      // Load lyrics
      api.localMusic.getLyric(mid).then((lrc: string) => {
        console.log('原始歌词:', lrc)
        if (lrc) formModel.lrc = convertLrcFormat(lrc)
      })

      // Load cover if not present (lazy load)
      if (!formModel.img && song.hasCover) {
        api.localMusic.getCoverBase64(mid).then((img: string) => {
          if (img) formModel.img = img
        })
      }

      searchKeyword.value = song.name || ''
    } else {
      message.error('未找到歌曲信息')
      router.back()
    }
  } catch (e) {
    message.error('加载失败')
    router.back()
  }
})

const handleUpload = async ({ file, onFinish, onError }: any) => {
  try {
    const reader = new FileReader()
    reader.readAsDataURL(file.file as File)
    reader.onload = () => {
      formModel.img = reader.result as string
      onFinish()
    }
    reader.onerror = () => {
      onError()
    }
  } catch (e) {
    onError()
  }
}

const urlToBase64 = (url: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = url
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      try {
        const dataURL = canvas.toDataURL('image/jpeg')
        resolve(dataURL)
      } catch (e) {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
  })
}

const handleSave = async () => {
  if (!songPath.value) return
  saving.value = true
  try {
    const api = (window as any).api
    const res = await api.localMusic.writeTags(
      songPath.value,
      {
        name: formModel.name,
        singer: formModel.singer,
        albumName: formModel.albumName,
        year: formModel.year,
        genre: formModel.genre,
        lrc: formModel.lrc,
        img: formModel.img
      },
      { cover: true, lyrics: true }
    )
    if (res?.code === 'NEED_FIX_EXT') {
      dialog.warning({
        title: '修复文件扩展名',
        content: `检测到实际格式为 ${res.detected}，而扩展名为 ${res.currentExt}。是否修复为 ${res.proposedExt} 并继续保存？`,
        positiveText: '修复并保存',
        negativeText: '取消',
        onPositiveClick: async () => {
          const res2 = await api.localMusic.writeTags(
            songPath.value,
            {
              name: formModel.name,
              singer: formModel.singer,
              albumName: formModel.albumName,
              year: formModel.year,
              genre: formModel.genre,
              lrc: formModel.lrc,
              img: formModel.img
            },
            { cover: true, lyrics: true, fixExt: true }
          )
          if (res2?.success) {
            message.success('保存成功（已修复扩展名）')
            handleBack()
          } else {
            message.error(res2?.message || '保存失败')
          }
        }
      })
      return
    }
    if (res?.success) {
      message.success('保存成功')
      handleBack()
    } else {
      message.error(res?.message || '保存失败')
    }
  } catch (e: any) {
    message.error(e.message || '保存出错')
  } finally {
    saving.value = false
  }
}

const handleSearch = async () => {
  const kw = searchKeyword.value.trim()
  if (!kw) return
  searching.value = true
  searchResults.value = []

  try {
    const sources = ['wy', 'tx', 'kg', 'kw', 'mg']
    const all: any[] = []
    const searchPromises = sources.map(async (src) => {
      try {
        const res = await (window as any).api.music.requestSdk('search', {
          source: src,
          keyword: kw,
          page: 1,
          limit: 15
        })

        const list = res?.list || []
        if ((src === 'kg' || src === 'kw') && list.length > 0) {
          const tasks: any[] = []
          const itemsWithIndex: { item: any; index: number }[] = []

          list.forEach((item: any, index: number) => {
            if (!item?.img) {
              itemsWithIndex.push({ item, index })
              tasks.push(
                (window as any).api.music.requestSdk('getPic', {
                  source: src,
                  songInfo: item
                })
              )
            }
          })

          if (tasks.length > 0) {
            const pics = await Promise.all(tasks)
            pics.forEach((p, i) => {
              if (typeof p === 'string') {
                list[itemsWithIndex[i].index].img = p
              }
            })
          }
        }

        if (Array.isArray(list)) {
          return list.map((it: any) => ({ ...it, source: src }))
        }
        return []
      } catch (e) {
        console.error(`Search ${src} failed`, e)
        return []
      }
    })

    const results = await Promise.all(searchPromises)
    results.forEach((arr) => all.push(...arr))
    searchResults.value = all
  } catch (e: any) {
    message.error(e.message || '搜索失败')
  } finally {
    searching.value = false
  }
}

const applyResult = async (item: any) => {
  loading.value = true
  try {
    formModel.name = item.name || formModel.name
    formModel.singer = item.singer || formModel.singer
    formModel.albumName = item.albumName || formModel.albumName

    if (item.img) {
      const b64 = await urlToBase64(item.img)
      if (b64) {
        formModel.img = b64
      } else {
        formModel.img = item.img
      }
    } else {
      try {
        const pic = await (window as any).api.music.requestSdk('getPic', {
          source: item.source,
          songInfo: item
        })
        if (typeof pic === 'string') {
          const b64 = await urlToBase64(pic)
          formModel.img = b64 || pic
        }
      } catch {}
    }

    try {
      const lyricRes = await (window as any).api.music.requestSdk('getLyric', {
        source: item.source,
        songInfo: toRaw(item)
      })

      if (typeof lyricRes === 'string') {
        formModel.lrc = convertToStandardLrc(lyricRes)
        activeTab.value = 'edit'
        message.success('已应用元数据，请检查后保存')
      } else if (lyricRes && typeof lyricRes === 'object') {
        const w2wRaw = (lyricRes as any).crlyric || (lyricRes as any).cr_lyric || ''
        const stdRaw = (lyricRes as any).lyric || (lyricRes as any).lrc || ''

        if (w2wRaw) {
          lyricChoiceData.value = {
            standard: convertToStandardLrc(stdRaw || w2wRaw),
            wordByWord: convertLrcFormat(w2wRaw)
          }
          showLyricChoice.value = true
        } else {
          formModel.lrc = convertToStandardLrc(stdRaw)
          activeTab.value = 'edit'
          message.success('已应用元数据，请检查后保存')
        }
      }
    } catch (e) {
      console.warn('获取歌词失败', e)
      message.warning('获取歌词失败，仅应用了元数据')
      activeTab.value = 'edit'
    }
  } catch (e: any) {
    message.error('应用失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

const confirmLyricChoice = (choice: 'standard' | 'word-by-word') => {
  if (lyricChoiceData.value) {
    if (choice === 'standard') {
      formModel.lrc = lyricChoiceData.value.standard
    } else {
      formModel.lrc = lyricChoiceData.value.wordByWord
    }
  }
  showLyricChoice.value = false
  activeTab.value = 'edit'
  message.success('已应用元数据，请检查后保存')
}
</script>

<template>
  <div class="tag-editor-page">
    <div class="content">
      <n-card>
        <n-tabs v-model:value="activeTab" type="segment" animated>
          <n-tab-pane name="edit" tab="编辑信息">
            <n-form
              ref="formRef"
              :model="formModel"
              label-placement="left"
              label-width="80"
              require-mark-placement="right-hanging"
            >
              <div class="edit-layout">
                <div class="left-col">
                  <div class="cover-edit">
                    <n-image
                      width="240"
                      height="240"
                      :src="formModel.img || '/default-cover.png'"
                      object-fit="cover"
                      class="cover-img"
                      fallback-src="/default-cover.png"
                    />
                    <n-upload
                      accept="image/*"
                      :show-file-list="false"
                      :custom-request="handleUpload"
                      style="width: 100%; margin-top: 16px"
                    >
                      <n-button block>上传封面文件</n-button>
                    </n-upload>
                  </div>
                </div>
                <div class="right-col">
                  <n-form-item label="歌曲名">
                    <n-input v-model:value="formModel.name" placeholder="输入歌曲名" />
                  </n-form-item>
                  <n-form-item label="歌手">
                    <n-input v-model:value="formModel.singer" placeholder="输入歌手名" />
                  </n-form-item>
                  <n-form-item label="专辑">
                    <n-input v-model:value="formModel.albumName" placeholder="输入专辑名" />
                  </n-form-item>
                  <div class="row-2">
                    <n-form-item label="年份">
                      <n-input v-model:value="formModel.year" placeholder="年份" />
                    </n-form-item>
                    <n-form-item label="流派">
                      <n-input v-model:value="formModel.genre" placeholder="流派" />
                    </n-form-item>
                  </div>
                  <n-form-item label="歌词" class="lrc-item" style="flex: 1">
                    <n-input
                      v-model:value="formModel.lrc"
                      type="textarea"
                      placeholder="输入LRC歌词内容"
                      style="font-family: monospace; font-size: 12px; height: 100%"
                      :autosize="{ minRows: 8, maxRows: 15 }"
                    />
                  </n-form-item>
                </div>
              </div>
            </n-form>
            <div class="actions">
              <n-button
                type="primary"
                size="large"
                :loading="saving || loading"
                style="width: 200px"
                @click="handleSave"
              >
                保存修改
              </n-button>
            </div>
          </n-tab-pane>

          <n-tab-pane name="search" tab="在线搜索">
            <div class="search-bar">
              <n-input-group>
                <n-input
                  v-model:value="searchKeyword"
                  placeholder="输入关键词搜索 (歌曲名 歌手)"
                  @keydown.enter="handleSearch"
                />
                <n-button type="primary" :loading="searching" @click="handleSearch">
                  <template #icon><SearchIcon /></template>
                  搜索
                </n-button>
              </n-input-group>
            </div>

            <div v-if="searchResults.length > 0" class="search-results">
              <div
                v-for="item in searchResults"
                :key="item.songmid + item.source"
                class="result-item"
              >
                <div class="item-cover">
                  <n-image
                    :src="item.img"
                    width="48"
                    height="48"
                    object-fit="cover"
                    fallback-src="/default-cover.png"
                    preview-disabled
                  />
                </div>
                <div class="item-info">
                  <div class="item-title">
                    {{ item.name }}
                    <n-tag size="small" :bordered="false" class="source-tag">
                      {{ item.source.toUpperCase() }}
                    </n-tag>
                  </div>
                  <div class="item-sub">
                    {{ item.singer }} · {{ item.albumName.slice(0, 10) }}
                    <span v-if="item.interval" style="margin-left: 8px; color: #999">{{
                      item.interval
                    }}</span>
                  </div>
                </div>
                <div class="item-action">
                  <n-button size="small" secondary type="primary" @click="applyResult(item)">
                    使用
                  </n-button>
                </div>
              </div>
            </div>
            <div v-else-if="!searching && searchKeyword" class="empty-state">未找到相关结果</div>
            <div v-else class="empty-state">输入关键词开始搜索</div>
          </n-tab-pane>
        </n-tabs>
      </n-card>
    </div>

    <n-modal
      v-model:show="showLyricChoice"
      preset="dialog"
      title="选择歌词格式"
      positive-text="使用逐字歌词"
      negative-text="使用标准歌词"
      style="width: 600px"
      @positive-click="confirmLyricChoice('word-by-word')"
      @negative-click="confirmLyricChoice('standard')"
    >
      <div style="display: flex; gap: 16px; height: 400px">
        <div style="flex: 1; display: flex; flex-direction: column">
          <div style="font-weight: bold; margin-bottom: 8px">标准歌词</div>
          <n-input
            type="textarea"
            :value="lyricChoiceData?.standard"
            readonly
            style="flex: 1; font-family: monospace; font-size: 12px"
          />
        </div>
        <div style="flex: 1; display: flex; flex-direction: column">
          <div style="font-weight: bold; margin-bottom: 8px">逐字歌词 (已转换)</div>
          <n-input
            type="textarea"
            :value="lyricChoiceData?.wordByWord"
            readonly
            style="flex: 1; font-family: monospace; font-size: 12px"
          />
        </div>
      </div>
    </n-modal>
  </div>
</template>

<style scoped lang="scss">
:deep(.n-card) {
  background-color: transparent;
  border: none;
}

.tag-editor-page {
  // padding: 24px 32px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;

  .header {
    display: flex;
    align-items: center;
    margin-bottom: 24px;
  }

  .content {
    flex: 1;
    // max-width: 1000px;
    margin: 0 auto;
    width: 100%;
  }
}

.edit-layout {
  display: flex;
  gap: 32px;
  margin-bottom: 12px;

  .left-col {
    width: 240px;
    flex-shrink: 0;
    .cover-edit {
      display: flex;
      flex-direction: column;
      align-items: center;
      .cover-img {
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--n-border-color, #eee);
      }
    }
  }

  .right-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;

    .row-2 {
      display: flex;
      gap: 12px;
      > div {
        flex: 1;
      }
    }
  }
}

.actions {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.search-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;

  .options {
    display: flex;
    align-items: center;
    .label {
      font-size: 12px;
      color: #666;
      margin-right: 8px;
    }
  }
}

.search-results {
  max-height: 500px;
  overflow-y: auto;
  border: 1px solid var(--n-border-color, #eee);
  border-radius: 8px;

  .result-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--n-border-color, #f5f5f5);
    transition: background-color 0.2s;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: var(--n-hover-color, rgba(0, 0, 0, 0.05));
    }

    .item-cover {
      margin-right: 12px;
      img {
        border-radius: 4px;
        display: block;
      }
    }

    .item-info {
      flex: 1;
      min-width: 0;

      .item-title {
        font-weight: 500;
        margin-bottom: 4px;
        display: flex;
        align-items: center;

        .source-tag {
          margin-left: 8px;
          height: 18px;
          font-size: 10px;
        }
      }

      .item-sub {
        font-size: 12px;
        color: #666;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }
}

.empty-state {
  padding: 60px;
  text-align: center;
  color: #999;
}
</style>
