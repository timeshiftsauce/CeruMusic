import type { PluginContext } from '@shiqianjiang/ceru-plugin-sdk'

const tracks = [
  { id: 'morning', title: 'Morning Light', artist: 'Ceru Demo' },
  { id: 'rain', title: 'Rainy Afternoon', artist: 'Ceru Demo' },
  { id: 'night', title: 'Night Walk', artist: 'Ceru Demo' },
  { id: 'sunrise', title: '晨光', artist: '我的曲库' }
]

export function registerCatalog(ctx: PluginContext) {
  ctx.providers.register('catalog', {
    tracks: {
      async search(request) {
        const query = request.query.trim().toLowerCase()
        const matches = tracks.filter((track) =>
          (track.title + ' ' + track.artist).toLowerCase().includes(query)
        )
        const limit = Math.max(1, Math.min(request.limit, 100))

        return {
          items: matches.slice(0, limit).map((track) => ({
            ref: {
              pluginId: ctx.plugin.id,
              providerId: 'catalog',
              kind: 'track',
              id: track.id
            },
            title: track.title,
            subtitle: track.artist,
            playable: false,
            metadata: { artists: [track.artist] },
            capabilities: []
          }))
        }
      },
      async resolve() {
        return ctx.playback.failure({
          code: 'UNSUPPORTED',
          message: '演示曲库只有歌曲信息，尚未提供音频地址。'
        })
      }
    }
  })
}
