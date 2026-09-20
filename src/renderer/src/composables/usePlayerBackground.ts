import { onScopeDispose, ref, watch, type Ref } from 'vue'
import {
  BackgroundRender,
  IsolationRenderer,
  MeshGradientRenderer,
  PixiRenderer,
  type BaseRenderer
} from '@applemusic-like-lyrics/core'
import {
  getBackgroundRenderer,
  type BackgroundRendererType
} from '@renderer/config/backgroundRenderers'

interface BackgroundSession {
  type: BackgroundRendererType
  player: BackgroundRender<BaseRenderer>
  requestedAlbum: string
  loadedAlbum?: string
  loading?: Promise<void>
  disposed: boolean
}

export function usePlayerBackground(
  container: Ref<HTMLElement | null>,
  options: {
    renderer: () => BackgroundRendererType
    album: () => string
    active: () => boolean
    lowFreqVolume: () => number
  }
) {
  const ready = ref(false)
  let session: BackgroundSession | undefined

  const release = () => {
    const previous = session
    session = undefined
    ready.value = false
    if (!previous) return
    previous.disposed = true
    previous.player.pause()
    previous.player.getElement().remove()
    // Pixi 的封面加载无法取消，等待它结束再销毁，避免异步访问已释放的纹理。
    if (previous.loading) void previous.loading.finally(() => previous.player.dispose())
    else previous.player.dispose()
  }

  const applyVolume = (current: BackgroundSession) => {
    current.player.setLowFreqVolume(
      getBackgroundRenderer(current.type).supportsBeat ? options.lowFreqVolume() : 0
    )
  }

  const loadAlbum = (current: BackgroundSession) => {
    current.requestedAlbum = options.album()
    if (current.loading || current.requestedAlbum === current.loadedAlbum) return
    current.loading = (async () => {
      try {
        while (!current.disposed && current.requestedAlbum !== current.loadedAlbum) {
          const album = current.requestedAlbum
          await current.player.setAlbum(album, false)
          if (current.disposed) return
          current.loadedAlbum = album
        }
        if (session !== current) return
        if (options.active()) current.player.resume()
        else current.player.pause()
        requestAnimationFrame(() => {
          if (session === current) ready.value = true
        })
      } catch (error) {
        if (!current.disposed) console.warn('加载播放页背景失败:', error)
      } finally {
        current.loading = undefined
      }
    })()
  }

  watch(
    [container, options.renderer, options.active],
    ([host, type, active]) => {
      if (session && (session.type !== type || !host)) release()
      if (!host || !active) {
        session?.player.pause()
        return
      }
      if (!session) {
        const player =
          type === 'pixi'
            ? BackgroundRender.new(PixiRenderer)
            : type === 'isolation'
              ? BackgroundRender.new(IsolationRenderer)
              : BackgroundRender.new(MeshGradientRenderer)
        session = { type, player, requestedAlbum: '', disposed: false }
        const canvas = player.getElement()
        Object.assign(canvas.style, {
          position: 'absolute',
          inset: '0',
          width: '100%',
          height: '100%'
        })
        host.appendChild(canvas)
        player.setRenderScale(0.5)
        player.setFlowSpeed(1)
        player.setFPS(30)
      }
      applyVolume(session)
      session.player.resume()
      loadAlbum(session)
    },
    { immediate: true, flush: 'post' }
  )

  watch(options.album, () => {
    if (session && options.active()) loadAlbum(session)
  })
  watch(options.lowFreqVolume, () => {
    if (session) applyVolume(session)
  })
  onScopeDispose(release)
  return { ready }
}
