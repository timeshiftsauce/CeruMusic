import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

export interface AudioOutputDevice {
  deviceId: string
  kind: MediaDeviceKind
  label: string
  groupId: string
}

export interface DeviceStats {
  sampleRate: number
  channelCount: number
  latency: number
}

export const useAudioOutputStore = defineStore(
  'audioOutput',
  () => {
    const devices = ref<AudioOutputDevice[]>([])
    const currentDeviceId = ref<string>('default')
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    const deviceStats = ref<DeviceStats>({
      sampleRate: 0,
      channelCount: 0,
      latency: 0
    })

    // For A/B testing
    const primaryDeviceId = ref<string>('default')
    const secondaryDeviceId = ref<string>('')
    const activeABChannel = ref<'A' | 'B'>('A') // 'A' or 'B'

    const sortedDevices = computed(() => {
      return [...devices.value].sort((a, b) => {
        if (a.deviceId === 'default') return -1
        if (b.deviceId === 'default') return 1
        return a.label.localeCompare(b.label)
      })
    })

    const currentDeviceLabel = computed(() => {
      const device = devices.value.find((d) => d.deviceId === currentDeviceId.value)
      return device ? device.label : 'Default'
    })

    // Scan for available audio output devices
    const scanDevices = async () => {
      isLoading.value = true
      error.value = null
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        devices.value = allDevices
          .filter((device) => device.kind === 'audiooutput')
          .map((device) => ({
            deviceId: device.deviceId,
            kind: device.kind,
            label: device.label || `Speaker (${device.deviceId.slice(0, 5)}...)`,
            groupId: device.groupId
          }))

        // Verify if current device still exists
        if (
          currentDeviceId.value !== 'default' &&
          !devices.value.find((d) => d.deviceId === currentDeviceId.value)
        ) {
          console.warn(
            `Previously selected device ${currentDeviceId.value} not found, reverting to default.`
          )
          currentDeviceId.value = 'default'
          MessagePlugin.warning('上次使用的音频设备未找到，已切换回默认设备')
        }
      } catch (err: any) {
        console.error('Failed to enumerate audio devices:', err)
        if (err.name === 'NotAllowedError') {
          error.value = '访问音频设备权限被拒绝，请检查系统设置'
        } else if (err.name === 'NotFoundError') {
          error.value = '未找到音频输出设备'
        } else {
          error.value = err.message || '无法获取音频设备列表'
        }
        MessagePlugin.error(error.value || '获取音频设备列表失败')
      } finally {
        isLoading.value = false
      }
    }

    // Debug: Simulate large number of devices for performance testing
    const simulateDevices = (count: number = 100) => {
      const fakeDevices: AudioOutputDevice[] = []
      for (let i = 0; i < count; i++) {
        fakeDevices.push({
          deviceId: `fake-device-${i}`,
          kind: 'audiooutput',
          label: `Simulated Speaker ${i + 1} - High Definition Audio Device`,
          groupId: `fake-group-${i}`
        })
      }
      devices.value = [...devices.value, ...fakeDevices]
      MessagePlugin.info(`已生成 ${count} 个虚拟设备用于性能测试`)
    }

    // Set the audio output device
    const setDevice = async (deviceId: string) => {
      if (deviceId === currentDeviceId.value) return

      try {
        // We will delegate the actual switching to the AudioManager or GlobalAudio component
        // This store mainly manages the state.
        // However, we can emit an event or rely on a watcher in the component.
        currentDeviceId.value = deviceId

        // Update A/B state if applicable
        if (activeABChannel.value === 'A') {
          primaryDeviceId.value = deviceId
        } else {
          secondaryDeviceId.value = deviceId
        }

        MessagePlugin.success(`已切换音频输出至: ${currentDeviceLabel.value}`)
      } catch (err: any) {
        console.error('Failed to set audio device:', err)
        error.value = err.message
        MessagePlugin.error('切换音频设备失败')
      }
    }

    const toggleAB = () => {
      if (activeABChannel.value === 'A') {
        if (secondaryDeviceId.value && secondaryDeviceId.value !== primaryDeviceId.value) {
          activeABChannel.value = 'B'
          setDevice(secondaryDeviceId.value)
        } else {
          MessagePlugin.info('请先设置对比设备 (设备 B)')
        }
      } else {
        activeABChannel.value = 'A'
        setDevice(primaryDeviceId.value)
      }
    }

    const handleDeviceChange = () => {
      console.log('Audio devices changed, rescanning...')
      scanDevices()
    }

    // Initialize listener for device changes (hot-plugging)
    const init = () => {
      scanDevices()
      // Ensure we don't duplicate listeners
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    }

    const playTestSound = (deviceId: string) => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioContextClass()

        // Try to route if supported
        if ((ctx as any).setSinkId && deviceId !== 'default') {
          try {
            ;(ctx as any).setSinkId(deviceId)
          } catch (e) {
            console.warn('Test sound routing failed', e)
          }
        }

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.type = 'sine'
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1)

        gain.gain.setValueAtTime(0.1, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)

        osc.start()
        osc.stop(ctx.currentTime + 0.5)

        setTimeout(() => {
          ctx.close()
        }, 600)
      } catch (err: any) {
        console.error('Test sound failed', err)
        MessagePlugin.error('测试音播放失败')
      }
    }

    return {
      devices,
      sortedDevices,
      currentDeviceId,
      isLoading,
      error,
      deviceStats,
      currentDeviceLabel,
      primaryDeviceId,
      secondaryDeviceId,
      activeABChannel,
      scanDevices,
      setDevice,
      toggleAB,
      init,
      playTestSound,
      simulateDevices
    }
  },
  {
    persist: {
      paths: ['currentDeviceId', 'primaryDeviceId', 'secondaryDeviceId']
    } as any
  }
)
