import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'

import type { SongList } from '@renderer/types/audio'
import type { UserInfo } from '@renderer/types/userInfo'

export const LocalUserDetailStore = defineStore('Local', () => {
  const list = ref<SongList[]>([])
  const userInfo = ref<UserInfo>({})
  const initialization = ref(false)
  function init(): void {
    const UserInfoLocal = localStorage.getItem('userInfo')
    const ListLocal = localStorage.getItem('songList')
    if (UserInfoLocal) {
      userInfo.value = JSON.parse(UserInfoLocal) as UserInfo
    } else {
      userInfo.value = {
        lastPlaySongId: null,
        topBarStyle: false,
        mainColor: '#00DAC0',
        volume: 80,
        currentTime: 0,
        selectSources: 'wy'
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

  function removeSong(songId: number|string) {
    const index = list.value.findIndex((item) => item.songmid === songId)
    if (index !== -1) {
      list.value.splice(index, 1)
    }
  }

  function clearList() {
    list.value = []
  }
  const userSource = computed(() => {
    return {
      pluginId: userInfo.value.pluginId,
      source: userInfo.value.selectSources,
      quality: userInfo.value.selectQuality
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
    userSource
  }
})
