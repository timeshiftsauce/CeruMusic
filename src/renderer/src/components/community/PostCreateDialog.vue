<script setup lang="ts">
/**
 * 发帖对话框
 *
 * 支持:
 *  - 1-1000 字正文(后端会跑 DeepSeek AI 审核,失败给提示)
 *  - 0-9 张图片(前端先逐个调 /community/upload-image,服务端会做 NSFW 检测)
 *  - 0-1 个附件:单曲 或 歌单
 *      · 选歌单:从本地+云的合并列表里选;本地未上传的自动调
 *        cloudSongListAPI.createUserSongList 上传(逻辑与 songlist.vue 一致),
 *        拿到 cloudId 后再附加
 *      · 选单曲:先选一个歌单,从中选一首歌(优先展示"我的喜欢")
 *
 * 注: tdesign 自动导入 t-dialog / t-textarea / t-button 等。
 */
import { ref, computed, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { CloseIcon, ImageIcon, MusicIcon } from 'tdesign-icons-vue-next'
import { communityAPI, type PostAttachment, type CommunityPost, type PostImage } from '@renderer/api/community'
import { cloudSongListAPI } from '@renderer/api/cloudSongList'
import songListAPI from '@renderer/api/songList'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [v: boolean]
  created: [post: CommunityPost]
}>()

const visibleLocal = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v)
})

const content = ref('')
const images = ref<PostImage[]>([])
const uploadingImage = ref(false)
const attachment = ref<PostAttachment | null>(null)
const submitting = ref(false)

/* 附件选择器状态 */
const showPicker = ref(false)
const pickerTab = ref<'playlist' | 'song'>('playlist')
const pickerLists = ref<
  Array<{
    /** 当 isCloud=true 时是云 id;否则是本地 hashId */
    id: string
    name: string
    cover: string
    songCount: number
    isCloud: boolean
    /** 关联的云 id(本地已同步时填) */
    cloudId?: string
    /** 是否是"我的喜欢" */
    isFavorite?: boolean
  }>
>([])
const pickerLoading = ref(false)
const pickerSongs = ref<any[]>([])
const pickerSelectedListIdx = ref<number>(-1)

watch(visibleLocal, (v) => {
  if (v) reset()
})

function reset() {
  content.value = ''
  images.value = []
  attachment.value = null
  showPicker.value = false
  pickerSongs.value = []
  pickerSelectedListIdx.value = -1
}

/* ---------------- 图片上传 ---------------- */

async function handleImageFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files || files.length === 0) return
  const room = 9 - images.value.length
  if (room <= 0) {
    MessagePlugin.warning('最多 9 张图片')
    ;(e.target as HTMLInputElement).value = ''
    return
  }
  uploadingImage.value = true
  try {
    const arr = Array.from(files).slice(0, room)
    for (const f of arr) {
      try {
        const info = await communityAPI.uploadImage(f)
        images.value.push(info)
      } catch (err: any) {
        MessagePlugin.error(err?.message || '图片上传失败')
      }
    }
  } finally {
    uploadingImage.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

function removeImage(idx: number) {
  images.value.splice(idx, 1)
}

/* ---------------- 附件 picker ---------------- */

async function openPicker() {
  showPicker.value = true
  pickerTab.value = 'playlist'
  pickerSongs.value = []
  pickerSelectedListIdx.value = -1
  await loadPickerLists()
}

async function loadPickerLists() {
  pickerLoading.value = true
  try {
    /* 与 views/music/songlist.vue 同款合并: 本地 + 云,匹配 cloudId */
    const [localRes, cloudRes] = await Promise.all([
      songListAPI.getAll().catch(() => ({ success: false, data: [] }) as any),
      cloudSongListAPI.getUserSongLists().catch(() => [])
    ])
    const local = (localRes?.success ? localRes.data : []) || []
    const cloud = Array.isArray(cloudRes) ? cloudRes : []
    let favoritesId: string | null = null
    try {
      const fav = await (window as any).api?.songList?.getFavoritesId?.()
      favoritesId = fav?.data || null
    } catch {}

    const merged: typeof pickerLists.value = []
    const usedCloudIds = new Set<string>()
    local.forEach((l: any) => {
      const matchedCloud = cloud.find(
        (c: any) => c.localId === l.id || (l.meta && l.meta.cloudId === c.id)
      )
      if (matchedCloud) usedCloudIds.add(matchedCloud.id)
      merged.push({
        id: l.id,
        name: l.name,
        cover: l.coverImgUrl || matchedCloud?.cover || '',
        songCount: typeof l.songCount === 'number' ? l.songCount : 0,
        isCloud: false,
        cloudId: matchedCloud?.id,
        isFavorite: l.id === favoritesId
      })
    })
    cloud.forEach((c: any) => {
      if (usedCloudIds.has(c.id)) return
      merged.push({
        id: c.id,
        name: c.name,
        cover: c.cover,
        songCount: 0,
        isCloud: true,
        cloudId: c.id
      })
    })
    // 我的喜欢置顶
    merged.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0))
    pickerLists.value = merged
  } finally {
    pickerLoading.value = false
  }
}

/* 选歌单作为附件;本地未同步则先自动上传 */
async function pickPlaylist(idx: number) {
  const l = pickerLists.value[idx]
  if (!l) return
  pickerLoading.value = true
  try {
    let cloudId = l.cloudId
    let cover = l.cover
    let name = l.name
    let preview: any[] = []
    let total = l.songCount

    if (!cloudId) {
      // 本地未上传 -> 自动上传(复用 cmpl 那套逻辑)
      MessagePlugin.info('歌单未上传,正在自动上传到云端...')
      const songsRes = await songListAPI.getSongs(l.id)
      const songs = (songsRes?.success ? songsRes.data : []) || []
      const local = (await songListAPI.getAll().catch(() => ({ success: false, data: [] }) as any))
      const localItem = (local.data || []).find((x: any) => x.id === l.id)
      const created = await cloudSongListAPI.createUserSongList({
        localId: l.id,
        name: l.name,
        describe: localItem?.description || '',
        cover: localItem?.coverImgUrl || cover,
        songlist: songs.map((s: any) => ({
          songmid: String(s.songmid),
          name: s.name,
          singer: s.singer,
          albumName: s.albumName || '',
          albumId: s.albumId || '',
          source: s.source,
          interval: String(s.interval || '0'),
          img: s.img || '',
          types: s.types || []
        })) as any
      })
      cloudId = created.id
      preview = songs.slice(0, 3)
      total = songs.length
    } else {
      // 已云端 -> 拉前 3 首做预览
      try {
        const detail = await cloudSongListAPI.getSongListDetail(cloudId, 'asc', 3)
        preview = detail.list || []
        total = detail.total
      } catch (e: any) {
        // 拉不到预览不阻断附加
        console.warn('歌单预览拉取失败', e)
      }
    }

    attachment.value = {
      type: 'playlist',
      listId: cloudId,
      name,
      cover,
      songCount: total,
      preview
    }
    showPicker.value = false
    MessagePlugin.success('歌单已附加')
  } catch (e: any) {
    MessagePlugin.error(e?.message || '附加歌单失败')
  } finally {
    pickerLoading.value = false
  }
}

/* 选单曲: 选一个歌单 -> 从中选一首 */
async function pickListForSongs(idx: number) {
  pickerSelectedListIdx.value = idx
  const l = pickerLists.value[idx]
  if (!l) return
  pickerLoading.value = true
  try {
    if (l.isCloud && l.cloudId) {
      const detail = await cloudSongListAPI.getSongListDetail(l.cloudId, 'asc', 200)
      pickerSongs.value = detail.list || []
    } else {
      const res = await songListAPI.getSongs(l.id)
      pickerSongs.value = res?.success ? [...(res.data || [])] : []
    }
  } finally {
    pickerLoading.value = false
  }
}

function pickSong(s: any) {
  attachment.value = {
    type: 'song',
    song: {
      songmid: String(s.songmid),
      name: s.name,
      singer: s.singer,
      albumName: s.albumName || '',
      albumId: s.albumId || '',
      source: s.source,
      interval: String(s.interval || '0'),
      img: s.img || '',
      types: s.types || []
    }
  }
  showPicker.value = false
  MessagePlugin.success('歌曲已附加')
}

function removeAttachment() {
  attachment.value = null
}

/* ---------------- 提交 ---------------- */

async function submit() {
  if (!content.value.trim()) {
    MessagePlugin.warning('请填写正文')
    return
  }
  if (content.value.length > 1000) {
    MessagePlugin.warning('正文超过 1000 字')
    return
  }
  submitting.value = true
  try {
    const post = await communityAPI.createPost({
      content: content.value.trim(),
      images: images.value,
      attachment: attachment.value || undefined
    })
    emit('created', post)
    visibleLocal.value = false
  } catch (e: any) {
    MessagePlugin.error(e?.message || '发布失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <t-dialog
    v-model:visible="visibleLocal"
    header="发表帖子"
    :footer="false"
    width="640px"
    :close-on-overlay-click="false"
    destroy-on-close
  >
    <div class="create-form">
      <t-textarea
        v-model="content"
        :maxlength="1000"
        :rows="6"
        placeholder="分享你正在听的歌、想聊的事..."
      />
      <div class="counter">{{ content.length }} / 1000</div>

      <!-- 图片 -->
      <div class="images">
        <div v-for="(img, i) in images" :key="i" class="img-box">
          <img :src="img.url" />
          <button class="remove" @click="removeImage(i)"><CloseIcon size="14" /></button>
        </div>
        <label v-if="images.length < 9" class="add-img" :class="{ disabled: uploadingImage }">
          <ImageIcon size="22" />
          <span>{{ uploadingImage ? '上传中...' : '添加图片' }}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            :disabled="uploadingImage"
            @change="handleImageFiles"
          />
        </label>
      </div>

      <!-- 附件 -->
      <div class="attachment-row">
        <div v-if="attachment" class="attach-chip">
          <MusicIcon size="16" />
          <span v-if="attachment.type === 'song'">单曲: {{ attachment.song?.name }} - {{ attachment.song?.singer }}</span>
          <span v-else>歌单: {{ attachment.name }} ({{ attachment.songCount }} 首)</span>
          <button @click="removeAttachment"><CloseIcon size="12" /></button>
        </div>
        <t-button v-else theme="default" variant="outline" @click="openPicker">
          <MusicIcon size="16" /> 附加歌曲 / 歌单
        </t-button>
      </div>

      <div class="actions">
        <t-button theme="default" @click="visibleLocal = false">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="submit">发布</t-button>
      </div>
    </div>

    <!-- 二级 picker -->
    <t-dialog
      v-model:visible="showPicker"
      header="选择附件"
      :footer="false"
      width="540px"
      destroy-on-close
      attach="body"
    >
      <div class="picker">
        <div class="tabs">
          <button :class="{ active: pickerTab === 'playlist' }" @click="pickerTab = 'playlist'">附加歌单</button>
          <button :class="{ active: pickerTab === 'song' }" @click="pickerTab = 'song'; pickerSelectedListIdx = -1">附加单曲</button>
        </div>

        <div v-if="pickerLoading" class="picker-state">加载中...</div>

        <template v-else-if="pickerTab === 'playlist'">
          <div class="list-grid">
            <div v-for="(l, idx) in pickerLists" :key="l.id" class="list-item" @click="pickPlaylist(idx)">
              <img v-if="l.cover" :src="l.cover" />
              <div v-else class="cover-fallback">♬</div>
              <div class="info">
                <div class="name">
                  <span v-if="l.isFavorite" class="fav-tag">喜欢</span>
                  {{ l.name }}
                </div>
                <div class="sub">{{ l.isCloud || l.cloudId ? '已上传云端' : '本地(选中后自动上传)' }}</div>
              </div>
            </div>
            <div v-if="pickerLists.length === 0" class="picker-state">没有歌单</div>
          </div>
        </template>

        <template v-else>
          <!-- 先选歌单 -->
          <div v-if="pickerSelectedListIdx === -1" class="list-grid">
            <div v-for="(l, idx) in pickerLists" :key="l.id" class="list-item" @click="pickListForSongs(idx)">
              <img v-if="l.cover" :src="l.cover" />
              <div v-else class="cover-fallback">♬</div>
              <div class="info">
                <div class="name">
                  <span v-if="l.isFavorite" class="fav-tag">喜欢</span>
                  {{ l.name }}
                </div>
                <div class="sub">点击查看歌曲</div>
              </div>
            </div>
          </div>
          <!-- 再选歌曲 -->
          <template v-else>
            <div class="back-row">
              <t-button size="small" variant="text" @click="pickerSelectedListIdx = -1; pickerSongs = []">← 返回歌单列表</t-button>
            </div>
            <div class="song-list">
              <div v-for="s in pickerSongs" :key="s.songmid" class="song-row" @click="pickSong(s)">
                <img v-if="s.img" :src="s.img" />
                <div v-else class="cover-fallback small">♪</div>
                <div class="info">
                  <div class="name">{{ s.name }}</div>
                  <div class="sub">{{ s.singer }}</div>
                </div>
              </div>
              <div v-if="pickerSongs.length === 0" class="picker-state">此歌单暂无歌曲</div>
            </div>
          </template>
        </template>
      </div>
    </t-dialog>
  </t-dialog>
</template>

<style scoped lang="scss">
.create-form {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .counter {
    text-align: right;
    color: var(--td-text-color-placeholder, #aaa);
    font-size: 12px;
    margin-top: -4px;
  }

  .images {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    .img-box {
      position: relative;
      aspect-ratio: 1;
      border-radius: 8px;
      overflow: hidden;
      background: #eee;
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .remove {
        position: absolute;
        top: 4px;
        right: 4px;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        border: none;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }
    .add-img {
      aspect-ratio: 1;
      border: 1.5px dashed var(--td-border-level-2-color, #ddd);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--td-text-color-placeholder, #999);
      cursor: pointer;
      gap: 4px;
      font-size: 12px;
      &.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      input {
        display: none;
      }
    }
  }

  .attachment-row {
    margin: 4px 0;
    .attach-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--td-brand-color-light, #fff1f3);
      color: var(--td-brand-color, #ff2442);
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 13px;
      button {
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        margin-left: 4px;
      }
    }
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
}

.picker {
  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    button {
      flex: 1;
      padding: 8px;
      border: none;
      background: var(--td-bg-color-component, #f4f4f4);
      border-radius: 8px;
      cursor: pointer;
      color: var(--td-text-color-secondary, #666);
      &.active {
        background: var(--td-brand-color, #ff2442);
        color: #fff;
      }
    }
  }

  .list-grid {
    max-height: 380px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    &:hover {
      background: var(--td-bg-color-component-hover, #f4f4f4);
    }
    img,
    .cover-fallback {
      width: 44px;
      height: 44px;
      border-radius: 6px;
      object-fit: cover;
      background: #ddd;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      color: #888;
      flex-shrink: 0;
    }
    .info {
      flex: 1;
      min-width: 0;
      .name {
        font-size: 14px;
        color: var(--td-text-color-primary, #222);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        .fav-tag {
          background: var(--td-brand-color, #ff2442);
          color: #fff;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 8px;
          margin-right: 4px;
        }
      }
      .sub {
        font-size: 12px;
        color: var(--td-text-color-placeholder, #aaa);
        margin-top: 2px;
      }
    }
  }

  .picker-state {
    text-align: center;
    color: var(--td-text-color-placeholder, #aaa);
    padding: 30px 0;
  }

  .back-row {
    margin-bottom: 8px;
  }
  .song-list {
    max-height: 380px;
    overflow-y: auto;
    .song-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      &:hover {
        background: var(--td-bg-color-component-hover, #f4f4f4);
      }
      img,
      .cover-fallback {
        width: 36px;
        height: 36px;
        border-radius: 4px;
        object-fit: cover;
        flex-shrink: 0;
        background: #ddd;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #888;
      }
      .info {
        flex: 1;
        min-width: 0;
        .name {
          font-size: 13px;
          color: var(--td-text-color-primary, #222);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sub {
          font-size: 11px;
          color: var(--td-text-color-placeholder, #aaa);
        }
      }
    }
  }
}
</style>
