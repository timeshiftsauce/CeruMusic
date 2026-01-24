import { defineStore } from 'pinia'

export const playSetting = defineStore('playSetting', {
  state: () => ({
    isJumpLyric: true, // 是否使用跳动歌词
    bgPlaying: true, // 是否播放背景动画 布朗运动
    isAudioVisualizer: true, // 音频可视化
    layoutMode: 'cd', // 播放页布局模式: 'cd' | 'cover'
    showLeftPanel: true, // 是否显示左侧面板
    isImmersiveLyricColor: true, // 是否开启沉浸色歌词
    isBlurLyric: false, // 是否开启模糊歌词
    autoHideBottom: true // 是否自动隐藏底部控制栏
  }),
  getters: {
    getisJumpLyric: (state) => state.isJumpLyric,
    getBgPlaying: (state) => state.bgPlaying,
    getIsAudioVisualizer: (state) => state.isAudioVisualizer,
    getLayoutMode: (state) => state.layoutMode,
    getShowLeftPanel: (state) => state.showLeftPanel,
    getIsImmersiveLyricColor: (state) => state.isImmersiveLyricColor,
    getIsBlurLyric: (state) => state.isBlurLyric,
    getAutoHideBottom: (state) => state.autoHideBottom
  },
  actions: {
    setIsDumpLyric(isDumpLyric: boolean) {
      this.isJumpLyric = isDumpLyric
    },
    setIsBlurLyric(isBlurLyric: boolean) {
      this.isBlurLyric = isBlurLyric
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
    },
    setIsImmersiveLyricColor(isImmersiveLyricColor: boolean) {
      this.isImmersiveLyricColor = isImmersiveLyricColor
    },
    setAutoHideBottom(autoHideBottom: boolean) {
      this.autoHideBottom = autoHideBottom
    }
  },
  persist: true
})
