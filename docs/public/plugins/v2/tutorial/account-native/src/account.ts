import type {
  AccountSummary,
  JsonObject,
  JsonValue,
  PluginContext,
} from '@shiqianjiang/ceru-plugin-sdk'
import { asObject, fault, readSession, SESSION_KEY, type DemoSession } from './data'

type LoginAttempt = {
  id: string
  approved: boolean
  createdAt: number
}

export type AccountController = {
  getSession(): DemoSession | null
  publicAccount(): JsonObject
  publish(): Promise<void>
  requireAccount(): DemoSession
}

export async function createAccount(ctx: PluginContext): Promise<AccountController> {
  let session = readSession(await ctx.storage.get(SESSION_KEY))
  let attempt: LoginAttempt | null = null

  const publicAccount = (): JsonObject => ({
    signedIn: !!session,
    displayName: session?.displayName ?? '演示音乐账号',
    ...(session?.avatarUrl ? { avatarUrl: session.avatarUrl } : {}),
    ...(session?.membership && session.membership !== 'FREE' ? { badge: session.membership } : {}),
  })

  const accountSummary = (): AccountSummary => {
    const state = publicAccount()
    return {
      signedIn: state.signedIn as boolean,
      displayName: state.displayName as string,
      ...(typeof state.avatarUrl === 'string' ? { avatarUrl: state.avatarUrl } : {}),
      ...(typeof state.badge === 'string' ? { badge: state.badge } : {}),
    }
  }

  const publish = async () => {
    const account = publicAccount()
    await Promise.all([
      ctx.ui.setState('account', { account }),
      ctx.ui.setState('library', { account, changedAt: Date.now() }),
    ])
  }

  const requireAccount = () => {
    if (!session) throw fault('请先连接演示账号', 'AUTH_REQUIRED')
    return session
  }

  const register = (
    id: string,
    handler: Parameters<PluginContext['actions']['register']>[1],
  ) => ctx.effects.add(ctx.actions.register(id, handler))

  register('account.open', () => ctx.ui.openView('account'))
  register('account.summary', () => accountSummary())
  register('account.session', () => publicAccount())

  register('account.start', (input) => {
    const requestedId = asObject(input)?.attemptId
    const id = typeof requestedId === 'string' ? requestedId : `attempt-${Date.now()}`
    attempt = { id, approved: false, createdAt: Date.now() }
    return { status: 'waiting', attemptId: id, qrText: `CERU-DEMO:${id}` }
  })

  register('account.approve', (input) => {
    const id = asObject(input)?.attemptId
    if (!attempt || id !== attempt.id) throw fault('本次二维码已失效', 'CANCELLED')
    attempt.approved = true
    return { status: 'scanned' }
  })

  register('account.poll', async (input) => {
    const id = asObject(input)?.attemptId
    if (!attempt || id !== attempt.id || Date.now() - attempt.createdAt > 180_000) {
      attempt = null
      return { status: 'expired' } as JsonObject
    }
    if (!attempt.approved) return { status: 'waiting' } as JsonObject

    session = {
      cookie: `demo_session_${Date.now()}`,
      displayName: '演示体验用户',
      avatarUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=CeruDemo',
      membership: 'SVIP',
    }
    await ctx.storage.set(SESSION_KEY, session as unknown as JsonValue)
    attempt = null
    await publish()
    return { status: 'success', account: publicAccount() } as JsonObject
  })

  register('account.cancel', (input) => {
    const id = asObject(input)?.attemptId
    if (!id || id === attempt?.id) attempt = null
    return null
  })

  register('account.logout', async () => {
    attempt = null
    session = null
    await ctx.storage.delete(SESSION_KEY)
    await publish()
    await ctx.ui.closeView('account')
    return publicAccount()
  })

  const controller: AccountController = {
    getSession: () => session,
    publicAccount,
    publish,
    requireAccount,
  }
  await publish()
  return controller
}
