<script setup lang="ts">
import { ref, watch, reactive } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { SearchIcon } from 'tdesign-icons-vue-next'

const props = defineProps<{
  show: boolean
  song: any
}>()

const emit = defineEmits(['update:show', 'saved'])

const message = useMessage()
const dialog = useDialog()
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

const lyricFormat = ref<'standard' | 'word-by-word'>('standard')
const searchKeyword = ref('')
const searchResults = ref<any[]>([])
const searching = ref(false)

// Initialize form when song changes or modal opens
watch(
  () => props.show,
  (val) => {
    if (val && props.song) {
      // Reset form
      formModel.name = props.song.name || ''
      formModel.singer = props.song.singer || ''
      formModel.albumName = props.song.albumName || ''
      formModel.year = props.song.year || ''
      formModel.genre = props.song.genre || ''
      formModel.img = props.song.img || ''
      formModel.lrc = props.song.lrc || ''

      // Load full lyrics
      const api = (window as any).api
      api.localMusic.getLyric(props.song.songmid).then((lrc: string) => {
        if (lrc) formModel.lrc = lrc
      })

      // Initialize search keyword
      searchKeyword.value = props.song.name || ''
      searchResults.value = []
      activeTab.value = 'edit'
    }
  }
)

const handleClose = () => {
  emit('update:show', false)
}

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
  if (!props.song?.path) return
  saving.value = true
  try {
    const api = (window as any).api
    const res = await api.localMusic.writeTags(
      props.song.path,
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
            props.song.path,
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
            emit('saved', { ...formModel })
            handleClose()
          } else {
            message.error(res2?.message || '保存失败')
          }
        }
      })
      return
    }
    if (res?.success) {
      message.success('保存成功')
      emit('saved', { ...formModel })
      handleClose()
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

    // Parallel search requests could be better but let's follow the logic provided in prompt
    // The prompt provided logic uses a loop and awaits sequentially mostly, but has a Promise.all for pics in kg/kw

    // We can run source searches in parallel for better performance
    const searchPromises = sources.map(async (src) => {
      try {
        const res = await (window as any).api.music.requestSdk('search', {
          source: src,
          keyword: kw,
          page: 1,
          limit: 15
        })

        const list = res?.list || []

        // Handle kg/kw picture fetching
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
    // Fill basic info
    formModel.name = item.name || formModel.name
    formModel.singer = item.singer || formModel.singer
    formModel.albumName = item.albumName || formModel.albumName

    // Handle image
    if (item.img) {
      // Try to convert to base64 because writeTags only supports base64
      const b64 = await urlToBase64(item.img)
      if (b64) {
        formModel.img = b64
      } else {
        // Fallback to URL, although it might fail saving
        formModel.img = item.img
      }
    } else {
      // Try to fetch image if missing
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

    // Fetch lyrics
    try {
      const lyricRes = await (window as any).api.music.requestSdk('getLyric', {
        source: item.source,
        songInfo: toRaw(item),
        useFormat: lyricFormat.value === 'word-by-word' ? 'word-by-word' : null
      })

      if (typeof lyricRes === 'string') {
        formModel.lrc = lyricRes
      } else if (lyricRes && typeof lyricRes === 'object') {
        // Fallback if structured object returned (though getLyric with useFormat should return string)
        formModel.lrc = lyricRes.lyric || lyricRes.lrc || ''
      }
    } catch (e) {
      console.warn('获取歌词失败', e)
      message.warning('获取歌词失败，仅应用了元数据')
    }

    activeTab.value = 'edit'
    message.success('已应用元数据，请检查后保存')
  } catch (e: any) {
    message.error('应用失败: ' + e.message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="编辑歌曲标签"
    style="width: 800px; max-width: 90vw; max-height: 80vh"
    @update:show="handleClose"
  >
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
                  width="180"
                  height="180"
                  :src="formModel.img || '/default-cover.png'"
                  object-fit="cover"
                  class="cover-img"
                  fallback-src="/default-cover.png"
                />
                <n-upload
                  accept="image/*"
                  :show-file-list="false"
                  :custom-request="handleUpload"
                  style="width: 100%; margin-top: 10px"
                >
                  <n-button size="small" style="width: 100%">上传封面文件</n-button>
                </n-upload>
                <!-- <n-input
                  v-model:value="formModel.img"
                  placeholder="封面图片URL"
                  size="small"
                  style="margin-top: 10px; width: 100%"
                /> -->
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
            </div>
          </div>

          <n-form-item label="歌词" class="lrc-item">
            <n-input
              v-model:value="formModel.lrc"
              type="textarea"
              placeholder="输入LRC歌词内容"
              :autosize="{ minRows: 6, maxRows: 12 }"
              style="font-family: monospace; font-size: 12px"
            />
          </n-form-item>
        </n-form>
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

          <div class="options">
            <span class="label">歌词格式：</span>
            <n-radio-group v-model:value="lyricFormat" size="small">
              <n-radio-button value="standard">标准LRC</n-radio-button>
              <n-radio-button value="word-by-word">逐字LRC</n-radio-button>
            </n-radio-group>
          </div>
        </div>

        <div v-if="searchResults.length > 0" class="search-results">
          <div v-for="item in searchResults" :key="item.songmid + item.source" class="result-item">
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
                {{ item.singer }} · {{ item.albumName }}
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

    <template #footer>
      <div class="dialog-footer">
        <n-button @click="handleClose">取消</n-button>
        <n-button type="primary" :loading="saving || loading" @click="handleSave">
          保存修改
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped lang="scss">
.edit-layout {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;

  .left-col {
    width: 180px;
    flex-shrink: 0;
    .cover-edit {
      display: flex;
      flex-direction: column;
      align-items: center;
      .cover-img {
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #eee;
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
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 8px;

  .result-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #f5f5f5;
    transition: background-color 0.2s;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: #fafafa;
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
  padding: 40px;
  text-align: center;
  color: #999;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
