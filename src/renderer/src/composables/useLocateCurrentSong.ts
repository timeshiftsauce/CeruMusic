import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

type CurrentSongInfo = {
  songmid?: string | number | null
  source?: string | null
}

type SongIdentity = {
  songmid: string | number
  source: string
}

type ScrollTarget = {
  scrollToSong: (songmid: string | number, source: string) => void
}

interface UseLocateCurrentSongOptions<T extends SongIdentity> {
  displaySongs: Ref<T[]>
  currentPlayingSongInfo: Ref<CurrentSongInfo | null | undefined>
  songListRef: Ref<ScrollTarget | null | undefined>
}

export function useLocateCurrentSong<T extends SongIdentity>({
  displaySongs,
  currentPlayingSongInfo,
  songListRef
}: UseLocateCurrentSongOptions<T>) {
  const showLocateCurrentBtn = ref(false)
  const isHoveringLocateBtn = ref(false)

  let locateBtnTimer: ReturnType<typeof setTimeout> | null = null
  let waitingLocateScrollEnd = false
  let locateScrollSeen = false
  let locateScrollEndTimer: ReturnType<typeof setTimeout> | null = null
  let locateScrollFallbackTimer: ReturnType<typeof setTimeout> | null = null

  const hasCurrentPlayingSong = computed(() => {
    const currentSong = currentPlayingSongInfo.value
    if (!currentSong?.songmid || !currentSong?.source) {
      return false
    }

    return displaySongs.value.some(
      (song) =>
        String(song.songmid) === String(currentSong.songmid) && song.source === currentSong.source
    )
  })

  const clearLocateBtnTimer = () => {
    if (locateBtnTimer) {
      clearTimeout(locateBtnTimer)
      locateBtnTimer = null
    }
  }

  const clearLocateScrollTimers = () => {
    if (locateScrollEndTimer) {
      clearTimeout(locateScrollEndTimer)
      locateScrollEndTimer = null
    }
    if (locateScrollFallbackTimer) {
      clearTimeout(locateScrollFallbackTimer)
      locateScrollFallbackTimer = null
    }
  }

  const startLocateBtnHideTimer = () => {
    clearLocateBtnTimer()
    if (!showLocateCurrentBtn.value || isHoveringLocateBtn.value) return

    locateBtnTimer = setTimeout(() => {
      if (isHoveringLocateBtn.value) {
        startLocateBtnHideTimer()
        return
      }
      showLocateCurrentBtn.value = false
      locateBtnTimer = null
    }, 3000)
  }

  const triggerLocateBtnVisible = () => {
    if (!hasCurrentPlayingSong.value) {
      showLocateCurrentBtn.value = false
      clearLocateBtnTimer()
      return
    }

    showLocateCurrentBtn.value = true
    startLocateBtnHideTimer()
  }

  const handleSongListScroll = () => {
    if (waitingLocateScrollEnd) {
      locateScrollSeen = true
      clearLocateBtnTimer()
      if (locateScrollFallbackTimer) {
        clearTimeout(locateScrollFallbackTimer)
        locateScrollFallbackTimer = null
      }
      if (locateScrollEndTimer) {
        clearTimeout(locateScrollEndTimer)
      }
      locateScrollEndTimer = setTimeout(() => {
        waitingLocateScrollEnd = false
        showLocateCurrentBtn.value = false
        locateScrollEndTimer = null
      }, 140)
      return
    }

    triggerLocateBtnVisible()
  }

  const locateCurrentSong = () => {
    const currentSong = currentPlayingSongInfo.value
    if (!hasCurrentPlayingSong.value || !songListRef.value || !currentSong?.songmid || !currentSong.source) {
      return
    }

    waitingLocateScrollEnd = true
    locateScrollSeen = false
    clearLocateBtnTimer()
    clearLocateScrollTimers()

    locateScrollFallbackTimer = setTimeout(() => {
      if (!waitingLocateScrollEnd || locateScrollSeen) return
      waitingLocateScrollEnd = false
      showLocateCurrentBtn.value = false
      locateScrollFallbackTimer = null
    }, 800)

    songListRef.value.scrollToSong(currentSong.songmid, currentSong.source)
  }

  const handleLocateBtnMouseEnter = () => {
    isHoveringLocateBtn.value = true
    clearLocateBtnTimer()
  }

  const handleLocateBtnMouseLeave = () => {
    isHoveringLocateBtn.value = false
    startLocateBtnHideTimer()
  }

  watch(hasCurrentPlayingSong, (value) => {
    if (value) {
      triggerLocateBtnVisible()
      return
    }

    waitingLocateScrollEnd = false
    showLocateCurrentBtn.value = false
    clearLocateScrollTimers()
    clearLocateBtnTimer()
  })

  onBeforeUnmount(() => {
    clearLocateScrollTimers()
    clearLocateBtnTimer()
  })

  return {
    hasCurrentPlayingSong,
    showLocateCurrentBtn,
    isHoveringLocateBtn,
    triggerLocateBtnVisible,
    handleSongListScroll,
    locateCurrentSong,
    handleLocateBtnMouseEnter,
    handleLocateBtnMouseLeave
  }
}
