<script setup lang="ts">
/**
 * 聊天里的分享卡片(单曲 / 歌单)
 *
 * 渲染逻辑:
 *  - mounted 时按 cardType 调 fetchSongShare / fetchPlaylistShare(模块级缓存)
 *  - 详情还没拉到:骨架占位;详情失效:显示"分享已失效"
 *  - 单曲卡:封面 + 歌名 + 歌手 + 来源,点击 emit('action-song', detail)
 *  - 歌单卡:封面 + 标题 + 3 首歌预览,点击 emit('action-playlist', detail)
 *
 * 不在卡片内直接弹 actions 对话框 / 跳路由 —— 这些动作和具体业务耦合,
 * 由父组件(ChatPanel)拿到 detail 后决定。
 */
import { ref, onMounted, computed } from 'vue'
import { fetchSongShare, fetchPlaylistShare } from '@renderer/utils/listenTogether/shareLink'
import type { ShareDetail, PlaylistShareDetail } from '@renderer/api/share'

/* 入参故意放宽成 string —— 因为消息来自服务器透传的 meta(白名单是 string),
 * Vue 模板传 union 字面量类型会被识别成 filter `|`(deprecated)报错。 */
const props = defineProps<{
  cardType: string
  cardId: string
}>()

const emit = defineEmits<{
  (e: 'action-song', detail: ShareDetail): void
  (e: 'action-playlist', detail: PlaylistShareDetail): void
}>()

const isSong = computed(() => props.cardType === 'song')
const isPlaylist = computed(() => props.cardType === 'playlist')

const song = ref<ShareDetail | null>(null)
const playlist = ref<PlaylistShareDetail | null>(null)
const loaded = ref(false)
const failed = ref(false)

onMounted(async () => {
  if (isSong.value) {
    const d = await fetchSongShare(props.cardId)
    if (!d) failed.value = true
    else song.value = d
  } else if (isPlaylist.value) {
    const d = await fetchPlaylistShare(props.cardId)
    if (!d) failed.value = true
    else playlist.value = d
  } else {
    failed.value = true
  }
  loaded.value = true
})

function onClick(): void {
  if (failed.value) return
  if (isSong.value && song.value) emit('action-song', song.value)
  else if (isPlaylist.value && playlist.value) emit('action-playlist', playlist.value)
}
</script>

<template>
  <div
    class="msg-card"
    :class="{ 'is-clickable': !failed && loaded, 'is-playlist': isPlaylist }"
    @click="onClick"
  >
    <!-- 失效状态 -->
    <div v-if="loaded && failed" class="msg-card-failed">
      <span class="msg-card-fail-icon">⚠</span>
      <span>分享已失效或被删除</span>
    </div>

    <!-- 加载中骨架 -->
    <div v-else-if="!loaded" class="msg-card-skeleton">
      <div class="skel-cover"></div>
      <div class="skel-body">
        <div class="skel-line skel-line-title"></div>
        <div class="skel-line skel-line-sub"></div>
      </div>
    </div>

    <!-- 单曲卡 -->
    <template v-else-if="isSong && song">
      <img
        v-if="song.song.img"
        class="msg-card-cover"
        :src="song.song.img"
        alt=""
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <div v-else class="msg-card-cover msg-card-cover-fallback">♪</div>
      <div class="msg-card-body">
        <div class="msg-card-title">{{ song.song.name }}</div>
        <div class="msg-card-sub">{{ song.song.singer || '未知歌手' }}</div>
        <div class="msg-card-meta">单曲 · 由 {{ song.username }} 分享</div>
      </div>
    </template>

    <!-- 歌单卡 -->
    <template v-else-if="isPlaylist && playlist">
      <img
        v-if="playlist.playlist.cover"
        class="msg-card-cover"
        :src="playlist.playlist.cover"
        alt=""
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <div v-else class="msg-card-cover msg-card-cover-fallback">♬</div>
      <div class="msg-card-body">
        <div class="msg-card-title">{{ playlist.playlist.name }}</div>
        <div class="msg-card-sub">
          歌单 · {{ playlist.playlist.total }} 首 · 由 {{ playlist.username }} 分享
        </div>
        <div v-if="playlist.playlist.songs?.length" class="msg-card-tracks">
          <div
            v-for="(s, i) in playlist.playlist.songs.slice(0, 3)"
            :key="i"
            class="msg-card-track"
          >
            <span class="msg-card-track-idx">{{ i + 1 }}.</span>
            <span class="msg-card-track-name">{{ s.name }}</span>
            <span class="msg-card-track-singer">— {{ s.singer }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.msg-card {
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  min-width: 240px;
  max-width: 320px;
  transition:
    background 0.15s,
    transform 0.15s;

  &.is-clickable {
    cursor: pointer;
    &:hover {
      background: rgba(255, 255, 255, 0.14);
      transform: translateY(-1px);
    }
  }

  &.is-playlist {
    /* 歌单卡需要纵向布局以容纳 3 首预览 */
    flex-direction: column;
    .msg-card-cover {
      width: 56px;
      height: 56px;
      align-self: flex-start;
    }
  }
}

.msg-card-cover {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  background: rgba(0, 0, 0, 0.2);
}

.msg-card-cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: rgba(255, 255, 255, 0.6);
  background: linear-gradient(135deg, rgba(100, 130, 200, 0.3), rgba(150, 100, 200, 0.3));
}

.msg-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.msg-card-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.02em;
}

.msg-card-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-card-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.msg-card-tracks {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.msg-card-track {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  .msg-card-track-idx {
    color: rgba(255, 255, 255, 0.45);
    margin-right: 4px;
  }
  .msg-card-track-singer {
    color: rgba(255, 255, 255, 0.5);
    margin-left: 4px;
  }
}

.msg-card-failed {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  .msg-card-fail-icon {
    font-size: 16px;
    color: var(--td-warning-color, #e37318);
  }
}

.msg-card-skeleton {
  display: flex;
  gap: 10px;
  width: 100%;

  .skel-cover {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    animation: skel-pulse 1.4s ease-in-out infinite;
  }
  .skel-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    justify-content: center;
  }
  .skel-line {
    height: 10px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    animation: skel-pulse 1.4s ease-in-out infinite;
  }
  .skel-line-title {
    width: 70%;
  }
  .skel-line-sub {
    width: 45%;
  }
}

@keyframes skel-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

/* 自己气泡(主题色底)里的卡片 —— 反白对比度 */
:global(.msg-bubble.is-self-bubble) .msg-card {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.22);
  &.is-clickable:hover {
    background: rgba(255, 255, 255, 0.26);
  }
}
</style>
