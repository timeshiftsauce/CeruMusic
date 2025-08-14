<script setup lang="ts">
import { ref, onMounted, reactive, UnwrapRef } from 'vue'
import '@lrc-player/core/dist/style.css'
import Player from '@lrc-player/core'

type userAudio = {
  play: (lengthen?: boolean) => Promise<undefined>
  pause: (isNeed?: boolean, lengthen?: boolean) => Promise<undefined>
} & Omit<HTMLAudioElement, 'pause' | 'play'>

export interface MusicPlayerInstanceType {
  orderStatusVal: UnwrapRef<typeof orderStatusVal>
  el: UnwrapRef<userAudio>
  isPlay: UnwrapRef<boolean>
  reset: (val: boolean) => void
  pause: typeof pause
  play: typeof play
  time: number
  oldTime: number
  transitionIsPlay: UnwrapRef<boolean>
  addListener: (listener: ListenerName) => void
  cutSongHandler: () => void
}
interface Props {
  src: string
  ids?: number[]
  songs: GetMusicDetailData
}
const store = useUserInfo()
const props = defineProps<Props>()
const emit = defineEmits(['playEnd', 'cutSong'])
const isPlay = ref(false)
// 1列表循环 2随机播放 3单曲循环
const orderStatusVal = ref<1 | 2 | 3>(1)
const audio = ref<userAudio>()
const music = useMusicAction()
const flags = useFlags()
const transitionIsPlay = ref(false)
const { addListener, executeListener, pauseSomethingListener } = useListener(audio)
const { getPlayListDetailFn } = usePlayList()
const player = new Player({
  click
})
function click(time: number, index: number) {
  console.log(time, index)
  audio.value!.currentTime = time
}
function seeked() {
  player.syncIndex()
}
let originPlay: HTMLMediaElement['play']
let originPause: HTMLMediaElement['pause']

onMounted(() => {
  player.mount(document.querySelector('.lyric-container') as HTMLDivElement, audio.value)
  originPlay = audio.value!.play as HTMLMediaElement['play']
  originPause = audio.value!.pause as HTMLMediaElement['pause']
  // 播放，音量过渡提高
  audio.value!.play = play
  // 音量过渡减少为0，然后暂停
  audio.value!.pause = pause

  audio.value?.addEventListener('error', (event: any) => {
    // console.log('event.target.error', event.target.error)
    if (event.target.error.code === 4) {
    }
  })
})
function play(lengthen: boolean = false) {
  let volume = store.volume
  player.play()
  audio.value!.volume = 0
  originPlay.call(audio.value).catch((err) => {
    console.error('调用origin.play方法时抛出了错误：', err)
  })
  isPlay.value = true
  timeState.stop = false

  // 开始时直接改变就可以，让逐字歌词跟得上
  transitionIsPlay.value = true
  return transitionVolume(volume, true, lengthen).then(() => {})
}
function pause(isNeed: boolean = true, lengthen: boolean = false) {
  let volume = store.volume
  // 是否需要更新暂停标识， 什么时候不需要，就比如切换下一首歌的时候:
  // 这个时候会先调用pause暂停上一首进行过渡，然后在调用play播放，这个时候就不需要更新暂停标识
  isNeed && (isPlay.value = false)
  return transitionVolume(volume, false, lengthen).then(() => {
    player.pause()
    // 暂停时应该等待音量过渡完成在改变，让逐字歌词也有一个暂停过渡效果
    transitionIsPlay.value = false
  })
}
let timer: NodeJS.Timer
// 当过渡完成时会返回Promise
function transitionVolume(
  volume: number,
  target: boolean = true,
  lengthen: boolean = false
): Promise<undefined> {
  clearInterval(timer)
  const playVolume = lengthen ? 40 : 15
  const pauseVolume = lengthen ? 20 : 10
  return new Promise((resolve) => {
    if (target) {
      timer = setInterval(() => {
        audio.value!.volume = Math.min(audio.value!.volume + volume / playVolume, volume)
        if (audio.value!.volume >= volume) {
          resolve(undefined)
          clearInterval(timer)
        }
      }, 50)
      return
    }
    timer = setInterval(() => {
      audio.value!.volume = Math.max(audio.value!.volume - volume / pauseVolume, 0)
      if (audio.value!.volume <= 0) {
        clearInterval(timer)
        originPause.call(audio.value)
        audio.value!.volume = volume
        resolve(undefined)
      }
    }, 50)
  })
}

const timeState = reactive({
  stop: false,
  previousTime: 0 // 新增属性来保存旧的 currentTime
})

const timeupdate = () => {
  if (timeState.stop || isNaN($audio.el.duration)) {
    return
  }
  // 在更新 currentTime 之前，保存旧的值
  timeState.previousTime = music.state.currentTime
  music.state.currentTime = $audio.time
}

const reset = (val: boolean) => {
  music.state.currentTime = 0
  isPlay.value = val
  transitionIsPlay.value = val
  // 这里需要停止timeupdate的事件监视，因为在暂停音乐时会过渡结束（就相当于还是在播放一段时间），
  //  这样会导致进度条进度重置不及时
  timeState.stop = true // 在每次play方法时都会重置stop值
}
const end = () => {
  emit('playEnd')
}
const setOrderHandler = () => {
  const runtimeList = music.state.runtimeList

  let newValue = (orderStatusVal.value + 1) % orderStatus.length

  // 如果上一次是心动模式并且当前播放的列表是”我喜欢的“，这次切换为其他，则重新获取”我喜欢的“列表,并更新进行时列表
  if (runtimeList?.specialType === 5 && orderStatusVal.value === 0 && newValue !== 0) {
    getPlayListDetailFn(runtimeList.id, '', false)
    music.updateTracks(
      playListState.playList,
      playListState.playList.map((item) => item.id)
    )
  }

  // 如果当前播放歌单不是”我喜欢的“列表，则心动模式不可用
  orderStatusVal.value =
    newValue === 0 && runtimeList?.specialType !== 5 ? 1 : (newValue as typeof orderStatusVal.value)

  music.getIntelliganceListHandler()
}

// 执行切换事件，随后暂停time监听器，等待歌曲加载完成后会打开
const cutSongHandler = () => {
  console.log('music.state.lyric', music.state.lyric)
  const type = music.state.lrcMode === 1 ? 'lrc' : 'yrc'
  player.updateAudioLrc(music.state.lyric, type)
  executeListener('cutSong')
}

const exposeObj = {
  el: audio,
  orderStatusVal,
  isPlay,
  reset,
  play,
  pause,
  transitionIsPlay,
  addListener,
  cutSongHandler
}
Object.defineProperty(exposeObj, 'time', {
  get(): number {
    return audio.value!.currentTime
  },
  set(time: number) {
    try {
      audio.value!.currentTime = time
    } catch (e) {
      console.error('设置time时出现了错误: ', e, ',time: ', time)
    }
  }
})
Object.defineProperty(exposeObj, 'oldTime', {
  get(): number {
    return timeState.previousTime
  }
})
defineExpose(exposeObj)
</script>

<template>
  <div class="bottom-container">
    <audio
      @timeupdate="timeupdate"
      @ended="end"
      @seeked="seeked"
      ref="audio"
      class="plyr-audio"
      :src="props.src"
      preload="auto"
    />
  </div>
</template>

<style lang="less">
.plan-container {
  display: flex;
  align-items: center;
  height: 15px;
  position: absolute;
  top: -8.5px;
  width: 100%;
}
.el-overlay {
  .music-drawer {
  }
}
</style>
<style lang="less" scoped>
:deep(.el-drawer) {
  height: 100%;
}
.bottom-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 15px;
  backdrop-filter: blur(60px) saturate(210%);
}
</style>
