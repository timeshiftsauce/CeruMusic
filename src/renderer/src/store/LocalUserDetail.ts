import { getMusicStorage, setMusicStorage } from '@renderer/services/musicDataPersistence'
import { normalizeMusicItem, sameSong, songKey, selectSong } from '@common/musicItem'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'

import type { SongList } from '@renderer/types/audio'
import type { UserInfo } from '@renderer/types/userInfo'

export const LocalUserDetailStore = defineStore(
  'Local',
  () => {
    const list = ref<SongList[]>([])
    const userInfo = ref<UserInfo>({})
    const initialization = ref(false)
    const isWatchStarted = ref(false) // 防止重复创建 watch
    function persistUserInfo() {
      // Available providers are a runtime snapshot, not user preferences.
      const { supportedSources: _runtimeSources, ...preferences } = userInfo.value
      setMusicStorage('userInfo', JSON.stringify(preferences))
    }

    function init(): void {
      if (initialization.value) return
      const UserInfoLocal = getMusicStorage('userInfo')
      const ListLocal = getMusicStorage('songList')
      if (UserInfoLocal) {
        try {
          const parsed = JSON.parse(UserInfoLocal)
          userInfo.value =
            parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
        } catch {
          userInfo.value = {}
        }
        if (!userInfo.value.sourceQualityMap) userInfo.value.sourceQualityMap = {}
      } else {
        userInfo.value = {
          lastPlaySongId: null,
          topBarStyle: false,
          mainColor: '#00DAC0',
          volume: 80,
          currentTime: 0,
          selectSources: 'wy',
          sourceQualityMap: {},
          hasGuide: false
        }
        setMusicStorage('userInfo', JSON.stringify(userInfo.value))
      }
      if (ListLocal) {
        try {
          const parsed = JSON.parse(ListLocal)
          list.value = Array.isArray(parsed)
            ? parsed.flatMap((song) => {
                try {
                  return [normalizeMusicItem(song)]
                } catch {
                  return []
                }
              })
            : []
        } catch {
          list.value = []
        }
      } else {
        list.value = []
        setMusicStorage('songList', JSON.stringify([]))
      }
      console.log('init local user detail')
      initialization.value = true
      const Audio = ControlAudioStore()
      startWatch()
      Audio.setVolume(userInfo.value.volume as number)
    }
    function startWatch() {
      // 防止重复创建 watch
      if (isWatchStarted.value) {
        console.log('watch already started, skipping')
        return
      }
      isWatchStarted.value = true
      console.log('startWatch')
      watch(
        list,
        (newVal) => {
          setMusicStorage('songList', JSON.stringify(newVal.map(normalizeMusicItem)))
        },
        {
          deep: true
        }
      )
      watch(
        userInfo,
        (newVal) => {
          const { supportedSources: _runtimeSources, ...preferences } = newVal
          setMusicStorage('userInfo', JSON.stringify(preferences))
        },
        {
          deep: true
        }
      )
      // Commit deliberate selections immediately, including a close in the same tick.
      watch(
        () => [
          userInfo.value.selectSources,
          userInfo.value.selectQuality,
          userInfo.value.sourceQualityMap,
          userInfo.value.sourcePluginMap,
          userInfo.value.capabilityPluginMap,
          userInfo.value.uiPluginMap
        ],
        persistUserInfo,
        { deep: true, flush: 'sync' }
      )
    }

    function addSong(song: SongList) {
      song = normalizeMusicItem(song)
      if (!list.value.find((item) => sameSong(item, song))) {
        list.value.push(song)
      }

      return list.value
    }

    function addSongToFirst(song: SongList) {
      song = normalizeMusicItem(song)
      const existingIndex = list.value.findIndex((item) => sameSong(item, song))
      if (existingIndex !== -1) {
        // 如果歌曲已存在，将其移动到第一位
        const existingSong = list.value.splice(existingIndex, 1)[0]
        list.value.unshift(existingSong)
      } else {
        // 如果歌曲不存在，添加到第一位
        list.value.unshift(song)
      }
      return list.value
    }

    function removeSong(songId: number | string) {
      const selected = selectSong(list.value, songId)
      const index = selected ? list.value.indexOf(selected) : -1
      if (index !== -1) {
        const newList = [...list.value]
        newList.splice(index, 1)
        list.value = newList
      }
    }

    function clearList() {
      list.value = []
    }
    function replaceSongList(songs: SongList[]) {
      const seen = new Set<string>()
      const deduped: SongList[] = []
      for (const value of songs) {
        const song = normalizeMusicItem(value)
        const key = songKey(song)
        if (!seen.has(key)) {
          seen.add(key)
          deduped.push(song)
        }
      }
      list.value = deduped
      return list.value
    }
    const userSource = computed(() => {
      return {
        pluginId: userInfo.value.pluginId,
        source: userInfo.value.selectSources,
        quality:
          (userInfo.value.sourceQualityMap || {})[userInfo.value.selectSources as string] ||
          userInfo.value.selectQuality
      }
    })
    return {
      list,
      userInfo,
      initialization,
      init,
      addSong,
      addSongToFirst,
      removeSong,
      clearList,
      replaceSongList,
      userSource
    }
  },
  {
    persist: false
  }
)
