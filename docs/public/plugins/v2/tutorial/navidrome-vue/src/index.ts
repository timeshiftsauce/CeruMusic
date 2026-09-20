import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { api, createAccount, restoreAccount } from './api'
import { asRecord, storageKey, providerId, type Account, type PublicState } from './model'
import { createProvider } from './provider'

export default definePlugin(async (ctx) => {
  let account: Account | null = null
  let status = '尚未连接'

  try {
    account = restoreAccount(await ctx.storage.get(storageKey))
    if (account) status = '已载入保存的连接，等待检查'
  } catch {
    status = '保存的连接无效，请重新登录'
  }

  const publicState = (): PublicState => ({
    connected: !!account,
    status,
    serverUrl: account?.serverUrl ?? '',
    username: account?.username ?? '',
    remember: account?.remember ?? false,
    allowLocal: account?.allowLocal ?? true
  })

  const publish = async () => {
    const state = publicState()
    await ctx.ui.setState('connection', state)
    return state
  }

  ctx.actions.register('connection.open', () => ctx.ui.openView('connection'))
  ctx.actions.register('connection.read', () => publicState())

  ctx.actions.register('connection.save', async (value, operation) => {
    const candidate = createAccount(ctx, asRecord(value))
    const response = await api(ctx, candidate, 'ping', {}, operation)
    account = candidate
    status = `已连接${response.serverVersion ? ` · ${response.serverVersion}` : ''}`
    if (candidate.remember) await ctx.storage.set(storageKey, candidate)
    else await ctx.storage.delete(storageKey)
    return publish()
  })

  ctx.actions.register('connection.ping', async (_input, operation) => {
    if (!account) throw new Error('请先连接 Navidrome')
    const response = await api(ctx, account, 'ping', {}, operation)
    status = `连接正常${response.serverVersion ? ` · ${response.serverVersion}` : ''}`
    return publish()
  })

  ctx.actions.register('connection.logout', async () => {
    await ctx.storage.delete(storageKey)
    account = null
    status = '已断开，保存的令牌已清除'
    return publish()
  })

  ctx.providers.register(providerId, createProvider(ctx, () => account))
})
