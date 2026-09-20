import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { createApi } from './network'
import { registerCatalog } from './catalog'

export default definePlugin(async (ctx) => {
  const api = await createApi(ctx)

  ctx.actions.register('source.check', async (_input, operation) => {
    await api.allowLocal(operation)
    return api.client.get<{ ok: boolean; tracks: number }>('health', { operation })
  })

  const tracks = registerCatalog(ctx, api)
  ctx.actions.register('source.test', async (_input, operation) => {
    const request = { query: 'Ceru Tutorial', kinds: ['track'], filters: {}, limit: 2 }
    const first = await tracks.search(request, operation)
    const second = first.nextCursor
      ? await tracks.search({ ...request, cursor: first.nextCursor }, operation)
      : { items: [] }
    const lyrics = await tracks.lyrics(first.items[0].ref, operation)
    return JSON.parse(JSON.stringify({ first, second, lyrics }))
  })
})
