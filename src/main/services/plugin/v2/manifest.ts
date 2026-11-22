import type { PluginManifest } from 'ceru-plugin-sdk-v2'
import type { PluginDescriptor, PageInfo } from '@common/pluginDescriptor'

export function readV2Descriptor(pluginId: string, manifest: PluginManifest): PluginDescriptor {
  const contributions = manifest.contributes ?? {}
  const owned = <T extends object>(items?: T[]) =>
    (items ?? []).map((item) => ({ ...item, pluginId }))
  const actions = contributions.commands ?? []
  const pages: PageInfo[] = [
    ...owned(contributions.sidebarItems).map(
      (item) =>
        ({
          ...item,
          mount: 'sidebar' as const,
          group:
            item.group === 'discover' || item.group === 'library' ? item.group : ('tools' as const)
        }) as PageInfo
    ),
    ...owned(contributions.settingsPages).map((item) => ({ ...item, mount: 'settings' as const })),
    ...owned(contributions.homeSections).flatMap((item) =>
      item.kind === 'custom' && item.view
        ? [
            {
              id: item.id,
              title: item.title,
              view: item.view,
              icon: item.icon,
              order: item.order,
              pluginId,
              mount: 'home-tab' as const
            }
          ]
        : []
    ),
    ...owned(contributions.playlistSections).map((item) => ({
      ...item,
      mount: 'playlist-section' as const
    }))
  ]
  return {
    runtime: 2,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author || manifest.publisher,
    homepage: manifest.homepage,
    hasShareResolver: !!manifest.modules.share,
    providers: owned(contributions.providers),
    importers: owned(contributions.playlistImporters),
    lyricConverters: owned(contributions.lyricConverters),
    permissions: owned(manifest.permissions),
    accounts: owned(contributions.accountItems).map(
      ({ id, title, view, action, logoutAction }) => ({
        id,
        title,
        pluginId,
        loginMethods: [],
        legacy: { view, action, logoutAction }
      })
    ),
    actions: actions.map(({ action, title, description, view }) => ({
      id: action,
      title,
      description,
      view,
      pluginId
    })),
    views: owned(manifest.modules.surfaces).map(({ entry, ...view }) => ({
      ...view,
      module: entry
    })),
    pages,
    homeSections: owned(contributions.homeSections).flatMap(({ kind, view: _view, ...item }) =>
      kind === 'custom' ? [] : [{ ...item, kind }]
    ),
    slots: owned(contributions.uiExtensions),
    menus: owned(contributions.menus).map((menu) => ({
      ...menu,
      commandId: actions.find((command) => command.id === menu.commandId)?.action ?? ''
    })),
    styles: owned(contributions.styles),
    guestAdapters: owned(contributions.guestAdapters),
    services: [],
    dependencies: [],
    regions: [],
    skins: [],
    nativeModules: []
  }
}
