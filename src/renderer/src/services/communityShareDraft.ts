import { shallowRef, toRaw } from 'vue'
import mitt from 'mitt'
import type { MusicItem } from '@common/musicItem'
import type { SongList } from '@common/types/songList'
import type { CommunityPost } from '@renderer/api/community'
import { MessagePlugin } from '@renderer/plugin/notifications'
import { useAuthStore } from '@renderer/store/Auth'

type CommunityDraft = { type: 'song'; song: MusicItem } | { type: 'playlist'; playlist: SongList }

const draft = shallowRef<CommunityDraft>()
export const communityShareDraft = draft as Readonly<typeof draft>
export const communityShareEvents = mitt<{ created: CommunityPost }>()

export function openCommunityShare(draftInput: CommunityDraft) {
  if (!useAuthStore().isAuthenticated) {
    MessagePlugin.warning('请先登录后再发布笔记')
    return
  }
  if (draft.value) return
  draft.value =
    draftInput.type === 'song'
      ? { type: 'song', song: { ...toRaw(draftInput.song) } }
      : {
          type: 'playlist',
          playlist: { ...toRaw(draftInput.playlist), meta: { ...draftInput.playlist.meta } }
        }
}

export function closeCommunityShare() {
  draft.value = undefined
}
