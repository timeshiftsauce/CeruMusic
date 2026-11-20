import {
  PERMISSION_GROUPS,
  permissionGroup,
  type PermissionDeclaration
} from '@shiqianjiang/ceru-plugin-sdk'
import { getPluginPermissions, savePluginPermissions } from '../pluginConfig'
import { callPluginUI } from '../uiBridge'

type Permission = PermissionDeclaration
export const canonical = (value: any): string =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
          .join(',') +
        '}'
    : JSON.stringify(value)
const fingerprint = (p: Permission) => p.key + ':' + p.name + ':' + canonical(p.scope ?? {})

export function encodePermissionKeys(declarations: Permission[], keys: string[]) {
  if (
    !Array.isArray(keys) ||
    keys.some((key) => !declarations.some((permission) => permission.key === key))
  )
    throw new Error('无效的权限项')
  return declarations.filter((permission) => keys.includes(permission.key)).map(fingerprint)
}

export function readPermissionKeys(declarations: Permission[], records: string[]) {
  return declarations
    .filter(
      (permission) =>
        records.includes(fingerprint(permission)) ||
        (records.includes(permission.key) && canMigrate(permission))
    )
    .map((permission) => permission.key)
}

const previousNames: Record<string, string> = {
  network: 'network.request',
  'network.private': 'network.private',
  'fallback.hold': 'playback.fallback.hold',
  'library.read': 'library.read',
  'library.write': 'library.write'
}
function canMigrate(permission: Permission) {
  return (
    previousNames[permission.key] === permission.name && !Object.keys(permission.scope ?? {}).length
  )
}

export class PluginPermissions {
  private records = new Set<string>()
  private prompts = new Map<string, Promise<unknown>>()
  private promptedGroups = new Set<string>()
  private permissionNotices = new Map<string, number>()
  private promptQueue: Promise<unknown> = Promise.resolve()
  private revision = 0

  constructor(
    private owner: () => string,
    private name: () => string,
    private declarations: () => Permission[],
    private stopped: () => boolean,
    private changed: (keys: string[], revoke: boolean, changedKeys: string[]) => Promise<void>
  ) {}

  initialize() {
    this.records = new Set(getPluginPermissions(this.owner()))
    // Preserve grants from the earlier key-only development format only for its
    // known, unchanged broad capabilities; never infer a grant for a new scope.
    let migrated = false
    for (const permission of this.declarations()) {
      if (this.records.has(permission.key) && canMigrate(permission)) {
        this.records.delete(permission.key)
        this.records.add(fingerprint(permission))
        migrated = true
      }
    }
    if (migrated) savePluginPermissions(this.owner(), [...this.records])
  }
  status(key: string) {
    const p = this.declarations().find((item) => item.key === key)
    return !p
      ? 'undeclared'
      : this.records.has(fingerprint(p))
        ? 'granted'
        : this.records.has('deny:' + fingerprint(p))
          ? 'denied'
          : 'prompt'
  }
  getGrantedPermissions() {
    return this.declarations()
      .filter((p) => this.status(p.key) === 'granted')
      .map((p) => p.key)
  }
  setGrantedPermissions(keys: string[]) {
    if (keys.some(key => this.declarations().some(p => p.key === key && String(p.name) === 'runtime.trusted')))
      throw new Error('完全信任只能通过专用确认框授权或撤销')
    const previous = this.declarations().map(({key}) => [key, this.status(key)] as const)
    // Management consent is publisher-bound and owned by the trusted workflow.
    // Read current disk records so stale runtime instances cannot resurrect a revoked grant.
    const trustedConsent = getPluginPermissions(this.owner()).filter(record =>
      record.startsWith('trusted-consent:v1:') || record.startsWith('trusted-consent:v2:utility-unrestricted:'))
    this.records = new Set([...encodePermissionKeys(this.declarations(), keys), ...trustedConsent])
    this.promptedGroups.clear()
    this.revision++
    savePluginPermissions(this.owner(), [...this.records])
    const changedKeys = previous.filter(([key, status]) => this.status(key) !== status).map(([key]) => key)
    const revoked = previous.some(([key,status]) => status === 'granted' && this.status(key) !== 'granted')
    void this.changed(keys, revoked, changedKeys).catch(() => {})
  }
  async requestPermission(key: string): Promise<any> {
    // Full trust can only be granted by the publisher-bound installation/details flow.
    if (this.declarations().some(item => item.key === key && item.name === 'runtime.trusted'))
      return { status: 'denied' }
    if (!['prompt', 'denied'].includes(this.status(key))) return { status: this.status(key) }
    const p = this.declarations().find((item) => item.key === key)!
    const group = permissionGroup(p.name)
    const groupId = group ?? key
    let prompt = this.prompts.get(groupId)
    if (!prompt && this.promptedGroups.has(groupId)) {
      this.notifyPermissionDenied(p.name)
      return { status: this.status(key) }
    }
    if (!prompt) {
      prompt = this.promptQueue
        .then(async () => {
          if (this.stopped()) return
          const declarations = this.declarations().filter(
            (item) =>
              (group ? permissionGroup(item.name) === group : item.key === key) &&
              ['prompt', 'denied'].includes(this.status(item.key))
          )
          if (!declarations.length) return
          this.promptedGroups.add(groupId)
          const revision = this.revision
          let allowed: boolean
          try {
            allowed = !!(await callPluginUI(this.owner(), 'ui.permissions.request', {
              pluginName: this.name(),
              title: group ? PERMISSION_GROUPS[group].title : '使用插件功能',
              description: declarations.map((item) => item.reason).join('；')
            }))
          } catch (error) {
            // A missing/not-yet-mounted UI is not a user denial. Allow the next
            // operation to ask again instead of leaving the plugin stuck.
            this.promptedGroups.delete(groupId)
            throw error
          }
          if (this.stopped() || revision !== this.revision) return
          const changedKeys = declarations.filter(item => this.status(item.key) !== (allowed ? 'granted' : 'denied')).map(item => item.key)
          for (const item of declarations) {
            this.records.delete('deny:' + fingerprint(item))
            this.records.add((allowed ? '' : 'deny:') + fingerprint(item))
          }
          savePluginPermissions(this.owner(), [...this.records])
          await this.changed(
            declarations.map((item) => item.key),
            false,
            changedKeys
          )
        })
        .finally(() => this.prompts.delete(groupId))
      this.promptQueue = prompt.catch(() => undefined)
      this.prompts.set(groupId, prompt)
    }
    await prompt
    if (this.status(key) !== 'granted') this.notifyPermissionDenied(p.name)
    return { status: this.status(key) }
  }
  private notifyPermissionDenied(name: string) {
    const group = permissionGroup(name as Permission['name'])
    const id = group ?? name
    const now = Date.now()
    if (now - (this.permissionNotices.get(id) ?? 0) < 5000 || this.stopped()) return
    this.permissionNotices.set(id, now)
    const label = group ? PERMISSION_GROUPS[group].title : this.permissionLabel(name)
    void callPluginUI(this.owner(), 'ui.toast', {
      level: 'warning',
      message: `${this.name()}未获得“${label}”权限，请到设置 → 插件 → 权限中允许后重试`
    }).catch(() => {})
  }
  async authorize(key: string, name: string): Promise<void> {
    if (!this.declarations().some((p) => p.key === key && p.name === name))
      throw new Error('插件未声明权限: ' + name)
    if ((await this.requestPermission(key)).status !== 'granted') {
      this.notifyPermissionDenied(name)
      throw new Error('此功能尚未获得授权，可在插件的“权限”中允许后重试')
    }
  }
  private permissionLabel(name: string): string {
    return (
      (
        {
          'network.request': '网络访问',
          'network.private': '局域网访问',
          'network.socket': '网络连接',
          'library.read': '歌单读取',
          'library.write': '歌单修改',
          'library.delete': '歌单删除',
          'account.profile': '账号资料',
          'player.read': '播放状态读取',
          'player.control': '播放控制',
          'player.intercept': '拦截和更改播放与队列操作',
          'window.intercept': '拦截窗口关闭请求',
          'downloads.create': '创建下载',
          'downloads.manage': '下载管理',
          'files.read': '文件读取',
          'files.write': '文件写入',
          'clipboard.read': '剪贴板读取',
          'clipboard.write': '剪贴板写入',
          'localMusic.read': '本地音乐读取',
          'localMusic.write': '本地音乐修改',
          'settings.read': '设置读取',
          'settings.write': '设置修改',
          'window.control': '窗口控制',
          'hotkeys.register': '全局快捷键',
          'sharing.publish': '发布分享',
          'sharing.revoke': '撤销分享',
          'rooms.read': '一起听状态读取',
          'rooms.control': '一起听控制',
          'devices.control': '音频设备控制',
          'ai.use': 'AI 服务',
          'background.run': '后台任务',
          'external.open': '打开外部链接',
          'guests.manage': '子插件管理',
          'guests.run': '子插件运行'
        } as Record<string, string>
      )[name] || '相关功能'
    )
  }
}
