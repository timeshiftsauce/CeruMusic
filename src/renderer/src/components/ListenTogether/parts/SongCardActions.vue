<script setup lang="ts">
/**
 * 单曲卡片二级动作面板
 *
 * 自定义深色玻璃拟态 modal —— 在 ChatPanel(深色玻璃)/FullPlay(动态封面背景)
 * 这种"已经是浮层中的浮层"的语境里,默认 t-dialog 的白底很格格不入。手写
 * Teleport 到 body 的轻量 modal 更贴 LT 风格。
 *
 * 按角色出按钮:
 *  - 不在房间 / 房主 / admin → "立即播放"(默认主按钮) + "加入歌单"
 *  - 房间成员 → "申请点歌" + "加入歌单"(用 emit('addToPlaylistAndPlay'),
 *    playlistManager 内部会按角色分流到 lt.requestSong/addToQueue/普通播放,
 *    所以这里只改 UI label,底下逻辑不变)
 *
 * 操作反馈:
 *  - 所有动作完成 → NotifyPlugin 右下角卡片,按情景给文案
 *  - 失败 → NotifyPlugin.warning,不静默
 */
import { ref, computed, watch } from 'vue'
import { NotifyPlugin } from 'tdesign-vue-next'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import type { ShareDetail } from '@renderer/api/share'

const props = defineProps<{
  visible: boolean
  detail: ShareDetail | null
}>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
}>()

const lt = useListenTogetherStore()

interface LocalPlaylist {
  hashId: string
  name: string
  cover?: string
  total?: number
}

const playlists = ref<LocalPlaylist[]>([])
const playlistsLoaded = ref(false)
const showPicker = ref(false)
const acting = ref(false)

/** 当前角色下"播放" 按钮的标签和语义 */
const playLabel = computed(() => {
  if (lt.isInRoom && !lt.canControl) return '申请点歌'
  return '立即播放'
})
const playHint = computed(() => {
  if (lt.isInRoom && !lt.canControl) return '点歌需要管理员审批,你将看到一条提示'
  if (lt.isInRoom) return '会直接切到这首歌,房间内所有人同步播放'
  return '加入当前播放列表并开始播放'
})

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
    if (!v) {
      showPicker.value = false
      acting.value = false
    }
  }
)

function close(): void {
  emit('update:visible', false)
}

function buildSongPayload(): any {
  if (!props.detail) return null
  const s = props.detail.song
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

function notify(
  level: 'success' | 'info' | 'warning' | 'error',
  title: string,
  content: string
): void {
  /* 右下角通知卡片 —— 与 LtChatToast 一致,避免位置散落 */
  NotifyPlugin[level]({
    title,
    content,
    duration: 3000,
    placement: 'bottom-right',
    closeBtn: true
  })
}

async function playNow(): Promise<void> {
  const song = buildSongPayload()
  if (!song) return
  const emitter = (window as any).musicEmitter
  if (!emitter) {
    notify('error', '播放器未就绪', '请稍候重试')
    return
  }
  acting.value = true
  emitter.emit('addToPlaylistAndPlay', song)

  /* 反馈文案按角色定制 —— playlistManager 内部对 member 会先弹自己的 success,
   * 这里 NotifyPlugin 右下角是补一份 dialog 风格的明确反馈。 */
  const songLabel = `《${song.name || '未知歌曲'}》`
  if (lt.isInRoom && !lt.canControl) {
    notify('success', '已申请点歌', `${songLabel} 已提交,等待管理员审核`)
  } else if (lt.isInRoom) {
    notify('success', '已切歌', `房间内所有成员将同步播放 ${songLabel}`)
  } else {
    notify('success', '开始播放', songLabel)
  }
  close()
}

async function addToList(pl: LocalPlaylist): Promise<void> {
  const song = buildSongPayload()
  if (!song) return
  acting.value = true
  try {
    const res = await window.api?.songList?.addSongs(pl.hashId, [song])
    const ok =
      (res as any)?.success !== false && (res as any)?.code !== -1 && (res as any) !== false
    if (ok) {
      notify('success', '已加入歌单', `《${song.name}》→ ${pl.name}`)
    } else {
      notify('warning', '加入失败', (res as any)?.message || '请稍后再试')
    }
  } catch (e: any) {
    notify('error', '加入歌单失败', e?.message || '未知错误')
  } finally {
    acting.value = false
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="song-modal-fade">
      <div v-if="visible" class="song-modal-mask" @click.self="close">
        <div class="song-modal" @click.stop>
          <!-- 顶部 hero -->
          <div v-if="detail" class="song-hero">
            <img
              v-if="detail.song.img"
              class="song-hero-cover"
              :src="detail.song.img"
              alt=""
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
            <div v-else class="song-hero-cover song-hero-cover-fallback">♪</div>
            <div class="song-hero-meta">
              <div class="song-hero-title">{{ detail.song.name }}</div>
              <div class="song-hero-singer">{{ detail.song.singer || '未知歌手' }}</div>
              <div class="song-hero-source">来自 {{ detail.username }} 的分享</div>
            </div>
            <button class="song-modal-close" title="关闭" @click="close">✕</button>
          </div>

          <!-- 角色徽标 -->
          <div v-if="lt.isInRoom" class="song-role-hint">
            <span
              class="role-badge"
              :class="lt.canControl ? 'role-badge-admin' : 'role-badge-member'"
            >
              {{ lt.canControl ? '你是管理员' : '你是房间成员' }}
            </span>
          </div>

          <!-- 动作区 -->
          <div v-if="!showPicker" class="song-actions">
            <button
              class="song-action-btn song-action-primary"
              :disabled="acting"
              :title="playHint"
              @click="playNow"
            >
              <span class="song-action-icon">▶</span>
              <div class="song-action-body">
                <div class="song-action-title">{{ playLabel }}</div>
                <div class="song-action-sub">{{ playHint }}</div>
              </div>
            </button>

            <button class="song-action-btn" :disabled="acting" @click="showPicker = true">
              <span class="song-action-icon">＋</span>
              <div class="song-action-body">
                <div class="song-action-title">加入歌单</div>
                <div class="song-action-sub">添加到你自己的某个歌单</div>
              </div>
            </button>
          </div>

          <!-- 歌单选择 -->
          <div v-else class="song-picker">
            <div class="song-picker-header">
              <button class="song-picker-back" @click="showPicker = false">← 返回</button>
              <span>选择要加入的歌单</span>
              <span></span>
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
                :disabled="acting"
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
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.song-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.song-modal {
  width: 100%;
  max-width: 380px;
  background: rgba(28, 30, 38, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ---- hero ---- */
.song-hero {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 20px 20px 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0));
}

.song-hero-cover {
  flex: 0 0 auto;
  width: 72px;
  height: 72px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}
.song-hero-cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: rgba(255, 255, 255, 0.7);
  background: linear-gradient(135deg, #6691ff, #93b6ff);
}

.song-hero-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}
.song-hero-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-hero-singer {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-hero-source {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.song-modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.12s,
    color 0.12s;
  &:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }
}

/* ---- 角色提示 ---- */
.song-role-hint {
  padding: 0 20px;
  margin-bottom: 12px;
}
.role-badge {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.role-badge-admin {
  background: rgba(64, 158, 255, 0.22);
  color: #6aa5ff;
}
.role-badge-member {
  background: rgba(227, 115, 24, 0.22);
  color: #ffc080;
}

/* ---- 动作按钮 ---- */
.song-actions {
  padding: 4px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.song-action-btn {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.15s;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.16);
    transform: translateY(-1px);
  }
  &:active:not(:disabled) {
    transform: translateY(0);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.song-action-primary {
  background: linear-gradient(135deg, #4080ff, #6aa5ff);
  border-color: transparent;
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #5090ff, #7ab5ff);
    border-color: transparent;
  }
}

.song-action-icon {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
}
.song-action-primary .song-action-icon {
  background: rgba(255, 255, 255, 0.22);
}

.song-action-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.song-action-title {
  font-size: 14px;
  font-weight: 600;
}
.song-action-sub {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.65);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-action-primary .song-action-sub {
  color: rgba(255, 255, 255, 0.85);
}

/* ---- 歌单选择 ---- */
.song-picker {
  padding: 4px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.song-picker-header {
  display: grid;
  grid-template-columns: 60px 1fr 60px;
  align-items: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);
  letter-spacing: 0.02em;
  text-align: center;
  padding: 4px 0 8px;

  .song-picker-back {
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    font-size: 12px;
    padding: 4px;
    text-align: left;
    &:hover {
      color: #fff;
    }
  }
}

.song-picker-empty {
  padding: 24px 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
}

.song-picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 280px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }
}

.song-picker-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: #fff;
  font-family: inherit;
  transition:
    background 0.12s,
    border-color 0.12s;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.16);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .song-picker-cover {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    object-fit: cover;
    flex: 0 0 auto;
  }
  .song-picker-cover-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
  }

  .song-picker-meta {
    flex: 1;
    min-width: 0;
  }
  .song-picker-name {
    font-size: 13.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .song-picker-count {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
  }
}

/* ---- 进入/退出动画 ---- */
.song-modal-fade-enter-active,
.song-modal-fade-leave-active {
  transition:
    opacity 0.2s ease,
    backdrop-filter 0.2s ease;
  .song-modal {
    transition:
      transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.2s ease;
  }
}
.song-modal-fade-enter-from,
.song-modal-fade-leave-to {
  opacity: 0;
  .song-modal {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
}
</style>
