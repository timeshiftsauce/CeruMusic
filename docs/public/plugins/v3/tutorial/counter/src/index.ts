import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  const key = 'clicks'
  let pending = Promise.resolve()

  async function readCount() {
    const value = await ctx.storage.get(key)
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
  }

  ctx.actions.register('counter.read', () => queueUpdate(false))
  ctx.actions.register('counter.increment', () => queueUpdate(true))

  function queueUpdate(increment: boolean) {
    // 多个视图可以同时调用，先完成上一个读写，再开始下一个。
    const result = pending.then(async () => {
      const current = await readCount()
      const count = increment ? current + 1 : current
      if (increment) await ctx.storage.set(key, count)
      await ctx.ui.views.setState('counter-view', { count })
      return { count }
    })
    pending = result.then(() => {}, () => {})
    return result
  }
})
