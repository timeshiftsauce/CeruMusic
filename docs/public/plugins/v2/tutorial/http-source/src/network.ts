import type { OperationContext, PluginContext } from '@shiqianjiang/ceru-plugin-sdk'

export async function createApi(ctx: PluginContext) {
  const config = await ctx.config.get<{ apiOrigin: string }>()
  const baseURL = new URL('/v1/', config.apiOrigin).href
  const client = ctx.http.create({
    baseURL,
    permissionKey: 'source.http',
    requestPermission: true
  })

  async function allowLocal(operation: OperationContext) {
    operation.signal.throwIfAborted()
    let grant = await ctx.permissions.query({ key: 'source.private' })
    if (grant.status === 'prompt') {
      grant = await ctx.permissions.request({
        key: 'source.private',
        intent: operation.userIntent
      })
    }
    if (grant.status !== 'granted') throw new Error('请允许访问局域网与本机服务')
    operation.signal.throwIfAborted()
  }

  return { baseURL, client, allowLocal }
}

export type Api = Awaited<ReturnType<typeof createApi>>
