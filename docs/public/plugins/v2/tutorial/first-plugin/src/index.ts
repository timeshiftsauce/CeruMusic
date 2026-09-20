import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { registerCatalog } from './catalog'

export default definePlugin(async (ctx) => {
  const readVisits = async () => (await ctx.storage.get<number>('visits')) ?? 0
  const showVisits = async (visits: number) => {
    await ctx.ui.setState('counter', { status: '已问候 ' + visits + ' 次' })
  }

  ctx.actions.register('hello', async () => {
    const visits = (await readVisits()) + 1
    await ctx.storage.set('visits', visits)
    await showVisits(visits)
    await ctx.ui.notify({
      key: 'welcome',
      level: 'info',
      message: '这是第 ' + visits + ' 次问候'
    })
  })

  registerCatalog(ctx)
  await showVisits(await readVisits())
})
