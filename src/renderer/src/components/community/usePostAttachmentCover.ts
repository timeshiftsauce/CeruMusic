import { ref, watch } from 'vue'
import type { CommunityPost } from '@renderer/api/community'
import { cloudSongListAPI } from '@renderer/api/cloudSongList'

/** Resolve shared-note artwork without downloading the entire attached playlist. */
export function usePostAttachmentCover(
  getPost: () => CommunityPost | null | undefined,
  enabled: () => boolean = () => true
) {
  const cover = ref('')
  let handleError: (url: string) => void = () => {}

  watch(
    () => {
      const post = getPost()
      const attachment = post?.attachment
      return [
        post?.id,
        enabled(),
        attachment?.type,
        attachment?.song?.img,
        attachment?.cover,
        attachment?.preview?.[0]?.img,
        attachment?.listId
      ] as const
    },
    ([, active, type, songCover, playlistCover, previewCover, listId], _previous, onCleanup) => {
      let cancelled = false
      let requested = false
      const failed = new Set<string>()
      const url = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
      onCleanup(() => {
        cancelled = true
      })
      cover.value = active ? url(type === 'song' ? songCover : playlistCover) : ''

      const fallback = async () => {
        if (!active || type !== 'playlist' || cancelled) return
        const preview = url(previewCover)
        if (preview && !failed.has(preview)) {
          cover.value = preview
          return
        }
        if (!listId || requested) return
        requested = true
        try {
          const result = await cloudSongListAPI.getSongListDetail(listId, 'asc', 1)
          const firstCover = url(result.list[0]?.img)
          if (!cancelled && !failed.has(firstCover)) cover.value = firstCover
        } catch {
          // An unavailable/empty playlist keeps the note's text fallback usable.
        }
      }

      handleError = (failedUrl) => {
        if (cancelled || !failedUrl || failedUrl !== cover.value) return
        failed.add(failedUrl)
        cover.value = ''
        void fallback()
      }
      if (!cover.value) void fallback()
    },
    { immediate: true }
  )

  return { cover, onCoverError: (url: string) => handleError(url) }
}
