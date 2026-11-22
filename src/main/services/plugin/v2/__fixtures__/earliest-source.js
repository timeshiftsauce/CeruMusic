exports.manifest = {
  manifestVersion: 2,
  id: 'example.early-source',
  name: '早期 v2 音源',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } },
  contributes: {
    providers: [
      {
        id: 'early',
        name: '早期音源',
        protocols: ['music.search@1', 'music.resolve@1', 'music.lyrics@1'],
      },
    ],
  },
}

exports.activate = function (ctx) {
  const ref = { pluginId: 'example.early-source', providerId: 'early', kind: 'track', id: 'one' }
  ctx.providers.register('early', {
    search() {
      return {
        items: [
          { ref, title: '第一首歌', capabilities: ['play'], metadata: { artists: ['歌手'] } },
        ],
      }
    },
    resolve() {
      return { ok: true, url: 'https://example.invalid/one.mp3' }
    },
    lyrics(track) {
      return { version: 1, track, offsetMs: 0, lines: [{ startTimeMs: 0, text: '第一行' }] }
    },
  })
}
