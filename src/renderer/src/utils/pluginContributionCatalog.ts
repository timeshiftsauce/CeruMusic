import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk'

export interface CatalogPlugin {
  pluginId: string
  manifest: PluginManifest
  providerMethods?: Record<string, string[]>
  actionIds?: string[]
  registrations?: Record<string, string[]>
}

export interface ContributionRow {
  key: string
  label: string
  description: string
  status: string
  selectable?: boolean
  implementations: CatalogPlugin[]
  declarations: { pluginId: string; type: string; id: string }[]
}

interface ContributionGroup {
  key: string
  name: string
  rows: ContributionRow[]
}

type ContributionType = keyof NonNullable<PluginManifest['contributes']>
// Adding a contribution type to the SDK requires an explicit catalogue description.
export const CONTRIBUTION_TYPES = {
  providers: { group: 'services', label: '音源接入', description: '提供音乐平台能力' },
  accountItems: {
    group: 'accounts',
    label: '账号入口',
    description: '账号胶囊菜单 · 登录与账号状态'
  },
  homeSections: { group: 'home', label: '首页栏目', description: '首页栏目' },
  playlistSections: {
    group: 'playlists',
    label: '歌单栏目',
    description: '歌单页 · 与本地、云歌单一起展示'
  },
  playlistImporters: { group: 'playlists', label: '歌单导入', description: '歌单导入菜单' },
  sidebarItems: { group: 'extensions', label: '侧边栏入口', description: '侧边栏入口' },
  settingsPages: { group: 'extensions', label: '设置入口', description: '插件设置入口' },
  uiExtensions: { group: 'extensions', label: '界面扩展', description: '向页面添加界面' },
  menus: { group: 'extensions', label: '菜单操作', description: '菜单入口' },
  styles: { group: 'extensions', label: '样式扩展', description: '插件提供的样式' },
  commands: {
    group: 'operations',
    label: '插件操作',
    description: '由所属插件执行，不参与音源分配'
  },
  lyricConverters: { group: 'services', label: '歌词格式转换', description: '解析和导出歌词格式' },
  guestAdapters: { group: 'services', label: '插件兼容环境', description: '加载兼容格式的子插件' }
} satisfies Record<ContributionType, { group: string; label: string; description: string }>

const slotNames: Record<string, string> = {
  'home.header': '首页顶部',
  'home.content.before': '首页内容上方',
  'home.content.after': '首页内容下方',
  'search.source-selector.after': '搜索页音源选择区',
  'playlist.header.actions': '歌单页操作区',
  'playlist.item.actions': '歌单歌曲菜单',
  'player.actions': '播放器操作区',
  'settings.sections': '设置页面',
  'playlist.import': '歌单导入菜单',
  'playlist.actions': '歌单菜单',
  'track.actions': '歌曲菜单',
  'search.tools': '搜索工具区'
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function registrationStatus(ids: string[] | undefined, id: string): string {
  return ids ? (ids.includes(id) ? '已注册' : '尚未注册') : '已声明'
}

/** One catalogue entry for every declaration. Unsupported types stay visible, never routable. */
export function getPluginContributionGroups(plugins: CatalogPlugin[]): ContributionGroup[] {
  const groups: Record<string, ContributionGroup> = {
    accounts: { key: '__accounts', name: '账号与登录', rows: [] },
    home: { key: '__ui', name: '首页界面', rows: [] },
    playlists: { key: '__playlists', name: '歌单界面', rows: [] },
    extensions: { key: '__extensions', name: '其他界面', rows: [] },
    services: { key: '__services', name: '其他服务', rows: [] },
    operations: { key: '__operations', name: '插件操作', rows: [] },
    surfaces: { key: '__surfaces', name: '可用界面', rows: [] },
    unknown: { key: '__unknown', name: '未识别扩展', rows: [] }
  }
  const homeRows = new Map<string, ContributionRow>()

  for (const plugin of plugins) {
    const contributions = plugin.manifest.contributes ?? {}
    const surfaces = plugin.manifest.modules?.surfaces ?? []
    const actions = plugin.registrations?.actions ?? plugin.actionIds
    for (const [type, rawItems] of Object.entries(contributions)) {
      const descriptor = Object.hasOwn(CONTRIBUTION_TYPES, type)
        ? (
            CONTRIBUTION_TYPES as Record<
              string,
              { group: string; label: string; description: string }
            >
          )[type]
        : undefined
      const items = Array.isArray(rawItems) ? rawItems : [rawItems]
      for (const [index, rawItem] of items.entries()) {
        const item = rawItem && typeof rawItem === 'object' ? (rawItem as Record<string, any>) : {}
        const id = text(item.id) || String(index)
        const surface = surfaces.find((view) => view.id === item.view)
        let group = descriptor?.group ?? 'unknown'
        const row: ContributionRow = {
          key: JSON.stringify([plugin.pluginId, type, id, index]),
          label:
            text(item.title) ||
            text(item.name) ||
            surface?.title ||
            `${descriptor?.label ?? type} · ${id}`,
          description:
            text(item.description) || descriptor?.description || `当前澜音未识别此类声明：${type}`,
          status: descriptor ? '已声明' : '尚未识别',
          implementations: [plugin],
          declarations: [{ pluginId: plugin.pluginId, type, id }]
        }
        if (type === 'providers') {
          row.description = `音源接入 · ${plugin.providerMethods?.[id]?.length ?? 0} 项已注册能力`
          row.status = registrationStatus(plugin.registrations?.providers, id)
        } else if (type === 'commands') {
          row.status = registrationStatus(actions, item.action)
          row.description = `${row.description} · 插件内操作`
        } else if (type === 'accountItems') {
          row.description += item.logoutAction ? '、退出登录' : ''
          row.status = registrationStatus(actions, item.action)
        } else if (type === 'playlistImporters') {
          row.status = registrationStatus(plugin.registrations?.importers, id)
        } else if (type === 'lyricConverters') {
          row.description += ` · ${(item.formats ?? []).join('、')}`
          row.status = registrationStatus(plugin.registrations?.lyricConverters, id)
        } else if (type === 'guestAdapters') {
          row.description += ` · ${text(item.format)}`
        } else if (type === 'styles') {
          const scope = (
            { surface: '插件界面', slot: '页面注入位置', application: '整个应用' } as Record<
              string,
              string
            >
          )[item.scope as string]
          row.description += ` · ${scope || text(item.scope)}`
        } else if (type === 'uiExtensions' || type === 'menus') {
          const slot = text(item.slot)
          group = slot.startsWith('home.')
            ? 'home'
            : slot.startsWith('playlist.')
              ? 'playlists'
              : 'extensions'
          row.description = `${slotNames[slot] || slot} · ${row.description}`
          if (type === 'menus') {
            const command = contributions.commands?.find((command) => command.id === item.commandId)
            row.status = command ? registrationStatus(actions, command.action) : '缺少菜单操作'
          }
        }
        if (item.view) {
          if (!surface) row.status = '缺少界面声明'
          else if (type === 'playlistSections' && surface.kind !== 'native')
            row.status = '需要原生界面'
          else if (surface.kind === 'native' && actions && !actions.includes(surface.entry))
            row.status = '界面尚未注册'
        }
        if (type === 'homeSections' && (item.kind === 'playlists' || item.kind === 'charts')) {
          const key = `home:${item.kind}`
          const existing = homeRows.get(key)
          if (existing) {
            existing.declarations.push(...row.declarations)
            if (!existing.implementations.some((item) => item.pluginId === plugin.pluginId))
              existing.implementations.push(plugin)
            continue
          }
          row.key = key
          row.label = item.kind === 'playlists' ? '首页歌单' : '首页排行榜'
          row.description = '首页 · 多个插件提供时可选择使用哪个'
          row.selectable = true
          homeRows.set(key, row)
        }
        groups[group].rows.push(row)
      }
    }

    for (const surface of surfaces) {
      groups.surfaces.rows.push({
        key: JSON.stringify([plugin.pluginId, 'surface', surface.id]),
        label: surface.title || `插件界面 · ${surface.id}`,
        description: '通过所属插件的入口打开',
        status: surface.kind === 'native' ? registrationStatus(actions, surface.entry) : '按需加载',
        implementations: [plugin],
        declarations: [{ pluginId: plugin.pluginId, type: 'modules.surfaces', id: surface.id }]
      })
    }
    if (plugin.manifest.modules?.share) {
      groups.services.rows.push({
        key: JSON.stringify([plugin.pluginId, 'share-module']),
        label: '分享播放解析',
        description: '为分享链接提供播放解析',
        status: '已声明',
        implementations: [plugin],
        declarations: [{ pluginId: plugin.pluginId, type: 'modules.share', id: 'share' }]
      })
    }

    // Runtime callbacks may be registered without a public command declaration.
    // Keep them in the owning plugin's operations, never in platform routing selectors.
    for (const action of actions ?? []) {
      if (contributions.commands?.some((command) => command.action === action)) continue
      groups.operations.rows.push({
        key: JSON.stringify([plugin.pluginId, 'registered-action', action]),
        label: action,
        description: '插件已注册的回调，未声明用户入口，由所属插件执行',
        status: '已注册',
        implementations: [plugin],
        declarations: []
      })
    }
    const registryTypes: Record<string, ContributionType> = {
      providers: 'providers', importers: 'playlistImporters', lyricConverters: 'lyricConverters'
    }
    for (const [registry, ids] of Object.entries(plugin.registrations ?? {})) {
      if (registry === 'actions') continue
      const type = Object.hasOwn(registryTypes, registry) ? registryTypes[registry] : undefined
      for (const id of ids) {
        if (type && contributions[type]?.some((item) => item.id === id)) continue
        groups[type ? 'services' : 'unknown'].rows.push({
          key: JSON.stringify([plugin.pluginId, 'registered', registry, id]),
          label: `${type ? CONTRIBUTION_TYPES[type].label : registry} · ${id}`,
          description: type ? '插件已注册的服务，未提供界面说明' : '已注册扩展，当前澜音尚未识别此注册类型',
          status: '已注册',
          implementations: [plugin],
          declarations: []
        })
      }
    }
  }
  return Object.values(groups).filter((group) => group.rows.length > 0)
}
