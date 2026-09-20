import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.actions.register('counter.increment', async () => {
    const old = await ctx.storage.get<number>('counter')
    const count = (old ?? 0) + 1
    await ctx.storage.set('counter', count)
    await ctx.ui.setState('counter', { count })
    return { count }
  })
})
