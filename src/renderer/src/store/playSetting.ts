import { defineStore } from 'pinia'

export const playSetting = defineStore('playSetting', {
  state: () => ({
    isJumpLyric: true, // 是否使用跳动歌词
    bgPlaying: true, // 是否播放背景动画 布朗运动
    isAudioVisualizer: true, // 音频可视化
    layoutMode: 'cd', // 播放页布局模式: 'cd' | 'cover'
    showLeftPanel: true // 是否显示左侧面板
  }),
  getters: {
    getisJumpLyric: (state) => state.isJumpLyric,
    getBgPlaying: (state) => state.bgPlaying,
    getIsAudioVisualizer: (state) => state.isAudioVisualizer,
    getLayoutMode: (state) => state.layoutMode,
    getShowLeftPanel: (state) => state.showLeftPanel
  },
  actions: {
    setIsDumpLyric(isDumpLyric: boolean) {
      this.isJumpLyric = isDumpLyric
    },
    setBgPlaying(bgPlaying: boolean) {
      this.bgPlaying = bgPlaying
    },
    setIsAudioVisualizer(isAudioVisualizer: boolean) {
      this.isAudioVisualizer = isAudioVisualizer
    },
    setLayoutMode(mode: string) {
      this.layoutMode = mode
    },
    setShowLeftPanel(show: boolean) {
      this.showLeftPanel = show
    }
  },
  persist: true
})
