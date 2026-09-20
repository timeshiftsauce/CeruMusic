import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin(async (ctx) => {
  const saved = await ctx.storage.get<number>('counter')
  let count = Number.isInteger(saved) && Number(saved) >= 0 ? Number(saved) : 0
  let openedAt = 0
  let timer: ReturnType<typeof setInterval> | undefined

  const state = (status: string) => ({
    count,
    status,
    activeSeconds: openedAt ? Math.floor((Date.now() - openedAt) / 1000) : 0
  })

  const publish = async (status: string) => {
    const value = state(status)
    await ctx.ui.setState('counter', value)
    return value
  }

  ctx.actions.register('counter.read', async () => state('页面已连接'))

  ctx.actions.register('counter.increment', async () => {
    count += 1
    await ctx.storage.set('counter', count)
    return publish('计数已保存')
  })

  ctx.actions.register('counter.reset', async () => {
    count = 0
    await ctx.storage.set('counter', count)
    return publish('计数已重置')
  })

  ctx.actions.register('counter.surface-open', async () => {
    if (timer) clearInterval(timer)
    openedAt = Date.now()
    const value = await publish('页面已连接')
    timer = setInterval(() => void publish('页面已连接'), 1000)
    return value
  })

  ctx.actions.register('counter.surface-close', () => {
    if (timer) clearInterval(timer)
    timer = undefined
    openedAt = 0
    return { closed: true }
  })

  return () => {
    if (timer) clearInterval(timer)
  }
})
