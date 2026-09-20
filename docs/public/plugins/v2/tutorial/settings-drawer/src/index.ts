import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

type Quality = '128k' | '320k' | 'flac'
type Preferences = {
  displayName: string
  accessToken: string
  resultLimit: number
  autoPlay: boolean
  quality: Quality
}

const defaults: Preferences = {
  displayName: '我的音乐服务',
  accessToken: '',
  resultLimit: 20,
  autoPlay: false,
  quality: '320k'
}
const qualities: Quality[] = ['128k', '320k', 'flac']
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

function readPreferences(value: unknown): Preferences {
  if (!isObject(value)) return { ...defaults }
  return {
    displayName:
      typeof value.displayName === 'string' && value.displayName.trim()
        ? value.displayName.trim()
        : defaults.displayName,
    accessToken: typeof value.accessToken === 'string' ? value.accessToken : '',
    resultLimit:
      typeof value.resultLimit === 'number' &&
      Number.isInteger(value.resultLimit) &&
      value.resultLimit >= 1 &&
      value.resultLimit <= 100
        ? value.resultLimit
        : defaults.resultLimit,
    autoPlay: value.autoPlay === true,
    quality: qualities.includes(value.quality as Quality)
      ? (value.quality as Quality)
      : defaults.quality
  }
}

function readForm(input: unknown, current: Preferences): Preferences {
  if (!isObject(input)) throw new Error('表单内容无效')
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : ''
  if (!displayName || displayName.length > 40) throw new Error('显示名称应为 1 至 40 个字符')
  if (
    typeof input.resultLimit !== 'number' ||
    !Number.isInteger(input.resultLimit) ||
    input.resultLimit < 1 ||
    input.resultLimit > 100
  ) {
    throw new Error('每页结果数应为 1 至 100 的整数')
  }
  if (typeof input.autoPlay !== 'boolean') throw new Error('自动播放设置无效')
  if (!qualities.includes(input.quality as Quality)) throw new Error('请选择有效的音质')
  const token = typeof input.accessToken === 'string' ? input.accessToken.trim() : ''
  if (token.length > 512) throw new Error('访问令牌过长')
  return {
    displayName,
    accessToken: token || current.accessToken,
    resultLimit: input.resultLimit,
    autoPlay: input.autoPlay,
    quality: input.quality as Quality
  }
}

export default definePlugin(async (ctx) => {
  let preferences = readPreferences(await ctx.storage.get('preferences'))

  const publish = async (status: string) => {
    const state = {
      displayName: preferences.displayName,
      resultLimit: preferences.resultLimit,
      autoPlay: preferences.autoPlay,
      quality: preferences.quality,
      canReset: true,
      status
    }
    await ctx.ui.setState('settings', state)
    return state
  }

  ctx.actions.register('settings.load', () => publish('设置已载入'))

  ctx.actions.register('settings.save', async (input) => {
    if (!isObject(input) || input.source !== 'settings-form') {
      throw new Error('保存来源无效')
    }
    preferences = readForm(input, preferences)
    await ctx.storage.set('preferences', preferences)
    return publish(preferences.accessToken ? '设置已保存，访问令牌已记录' : '设置已保存')
  })

  ctx.actions.register('settings.reset', async (input) => {
    if (!isObject(input) || input.scope !== 'all') throw new Error('重置范围无效')
    preferences = { ...defaults }
    await ctx.storage.set('preferences', preferences)
    return publish('已恢复默认值')
  })
})
