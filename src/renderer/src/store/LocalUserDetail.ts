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

    function init(): void {
      const UserInfoLocal = localStorage.getItem('userInfo')
      const ListLocal = localStorage.getItem('songList')
      if (UserInfoLocal) {
        userInfo.value = JSON.parse(UserInfoLocal) as UserInfo
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
        localStorage.setItem('userInfo', JSON.stringify(userInfo.value))
      }
      if (ListLocal) {
        list.value = JSON.parse(ListLocal) as SongList[]
      } else {
        list.value = []
        localStorage.setItem('songList', JSON.stringify([]))
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
          localStorage.setItem('songList', JSON.stringify(newVal))
        },
        {
          deep: true
        }
      )
      watch(
        userInfo,
        (newVal) => {
          localStorage.setItem('userInfo', JSON.stringify(newVal))
        },
        {
          deep: true
        }
      )
    }

    function addSong(song: SongList) {
      if (!list.value.find((item) => item.songmid === song.songmid)) {
        list.value.push(song)
      }

      return list.value
    }

    function addSongToFirst(song: SongList) {
      const existingIndex = list.value.findIndex((item) => item.songmid === song.songmid)
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
      const index = list.value.findIndex((item) => item.songmid === songId)
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
      const seen1 = new Set<string | number>()
      console.log(
        'origin',
        songs.filter((item) => {
          const keyValue = item.songmid
          if (seen1.has(keyValue)) {
            return false
          } else {
            seen1.add(keyValue)
            return true
          }
        })
      )

      const seen = new Set<string | number>()
      const deduped: SongList[] = []
      for (const s of songs) {
        const mid = (s as any).songmid
        if (!seen.has(mid)) {
          seen.add(mid)
          deduped.push(s)
        }
      }
      console.log('size', seen.size)
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
