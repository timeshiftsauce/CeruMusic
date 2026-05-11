<script setup lang="ts">
/**
 * 单曲卡片二级动作面板
 *
 * 用户在聊天里点了单曲卡片后弹这个 dialog,提供两条路径:
 *  - 直接播放:走 musicEmitter('addToPlaylistAndPlay'),playlistManager 内部
 *    会按 LT 角色分流(member 自动转 requestSong / admin 自动转 addToQueue /
 *    不在房间则正常播放),所以这里不需要重复角色判断
 *  - 加入歌单:列出本地歌单让用户挑一个,调 songList API 加进去
 *
 * 因为复用了 playlistManager 的角色分流,管理员/普通成员/非房间用户的差异
 * 完全交给底层处理,UI 层不感知 —— 体验上一致都是"播放"按钮。
 */
import { ref, onMounted, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { ShareDetail } from '@renderer/api/share'

const props = defineProps<{
  visible: boolean
  detail: ShareDetail | null
}>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
}>()

interface LocalPlaylist {
  hashId: string
  name: string
  cover?: string
  total?: number
}

const playlists = ref<LocalPlaylist[]>([])
const playlistsLoaded = ref(false)
const showPicker = ref(false)

/* 第一次打开时拉一次本地歌单;再次打开如果用户新建了歌单,这里看不到也无伤大雅 */
watch(
  () => props.visible,
  async (v) => {
    if (v && !playlistsLoaded.value) {
      try {
        const res = await window.api?.songList?.getAll()
        const items = (res as any)?.data || (res as any) || []
        playlists.value = items.map((p: any) => ({
          hashId: p.hashId || p.id,
          name: p.name,
          cover: p.coverImgUrl || p.cover,
          total: p.songs?.length || p.songCount || 0
        }))
      } catch {
        playlists.value = []
      }
      playlistsLoaded.value = true
    }
    if (!v) showPicker.value = false
  }
)

function close(): void {
  emit('update:visible', false)
}

function buildSongPayload(): any {
  if (!props.detail) return null
  const s = props.detail.song
  /* 先 spread s 兜底,再用显式字段覆盖 —— playlistManager 的 LT 分流读
   * source/songmid/etc 必须是字符串/标准形态,spread 之后再 normalize。 */
  return {
    ...s,
    songmid: s.songmid,
    source: s.source,
    hash: s.hash,
    name: s.name,
    singer: s.singer,
    img: s.img,
    albumName: s.albumName,
    albumId: s.albumId,
    interval: s.interval,
    types: s.types,
    _types: s._types
  }
}

function playNow(): void {
  const song = buildSongPayload()
  if (!song) return
  const emitter = (window as any).musicEmitter
  if (!emitter) {
    MessagePlugin.error('播放器未就绪')
    return
  }
  emitter.emit('addToPlaylistAndPlay', song)
  close()
}

async function addToList(pl: LocalPlaylist): Promise<void> {
  const song = buildSongPayload()
  if (!song) return
  try {
    const res = await window.api?.songList?.addSongs(pl.hashId, [song])
    const ok =
      (res as any)?.success !== false && (res as any)?.code !== -1 && (res as any) !== false
    if (ok) {
      MessagePlugin.success(`已加入歌单《${pl.name}》`)
    } else {
      MessagePlugin.warning((res as any)?.message || '加入失败')
    }
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加入歌单失败')
  }
  close()
}

onMounted(() => {
  /* nothing extra —— watch(visible) 已处理懒加载 */
})

defineExpose({ playNow })
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="false"
    :footer="false"
    placement="center"
    width="360"
    :close-on-overlay-click="true"
    @close="close"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <div v-if="detail" class="song-actions">
      <!-- 顶部:封面 + 信息 -->
      <div class="song-hero">
        <img v-if="detail.song.img" class="song-hero-cover" :src="detail.song.img" alt="" />
        <div v-else class="song-hero-cover song-hero-cover-fallback">♪</div>
        <div class="song-hero-meta">
          <div class="song-hero-title">{{ detail.song.name }}</div>
          <div class="song-hero-singer">{{ detail.song.singer || '未知歌手' }}</div>
          <div class="song-hero-source">来自 {{ detail.username }} 的分享</div>
        </div>
      </div>

      <!-- 动作区 -->
      <div v-if="!showPicker" class="song-actions-row">
        <t-button theme="primary" block @click="playNow">直接播放</t-button>
        <t-button theme="default" variant="outline" block @click="showPicker = true">
          加入歌单
        </t-button>
      </div>

      <!-- 歌单选择 -->
      <div v-else class="song-picker">
        <div class="song-picker-header">
          <span>选择要加入的歌单</span>
          <button class="song-picker-back" @click="showPicker = false">返回</button>
        </div>
        <div v-if="!playlistsLoaded" class="song-picker-empty">加载中...</div>
        <div v-else-if="playlists.length === 0" class="song-picker-empty">
          还没有任何歌单,去本地音乐页新建一个
        </div>
        <div v-else class="song-picker-list">
          <button
            v-for="pl in playlists"
            :key="pl.hashId"
            class="song-picker-item"
            @click="addToList(pl)"
          >
            <img
              v-if="pl.cover"
              class="song-picker-cover"
              :src="pl.cover"
              alt=""
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
            <div v-else class="song-picker-cover song-picker-cover-fallback">♬</div>
            <div class="song-picker-meta">
              <div class="song-picker-name">{{ pl.name }}</div>
              <div v-if="pl.total" class="song-picker-count">{{ pl.total }} 首</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </t-dialog>
</template>

<style scoped lang="scss">
.song-actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.song-hero {
  display: flex;
  gap: 12px;
  align-items: center;
}

.song-hero-cover {
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: cover;
}
.song-hero-cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: rgba(255, 255, 255, 0.65);
  background: linear-gradient(135deg, #6691ff, #93b6ff);
}

.song-hero-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.song-hero-title {
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-hero-singer {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
.song-hero-source {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
  margin-top: 2px;
}

.song-actions-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.song-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.song-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--td-text-color-secondary);

  .song-picker-back {
    border: none;
    background: transparent;
    color: var(--td-brand-color-5);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    &:hover {
      text-decoration: underline;
    }
  }
}

.song-picker-empty {
  padding: 16px 0;
  text-align: center;
  color: var(--td-text-color-placeholder);
  font-size: 13px;
}

.song-picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
}

.song-picker-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px;
  background: transparent;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.12s,
    border-color 0.12s;

  &:hover {
    background: var(--td-bg-color-container-hover);
    border-color: var(--td-brand-color-5);
  }

  .song-picker-cover {
    width: 36px;
    height: 36px;
    border-radius: 5px;
    object-fit: cover;
    flex: 0 0 auto;
  }
  .song-picker-cover-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--td-bg-color-component);
    color: var(--td-text-color-secondary);
  }

  .song-picker-meta {
    flex: 1;
    min-width: 0;
  }
  .song-picker-name {
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .song-picker-count {
    font-size: 11px;
    color: var(--td-text-color-placeholder);
  }
}
</style>
