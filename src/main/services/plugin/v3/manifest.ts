import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk'
import type { PluginDescriptor } from '@common/pluginDescriptor'

export function readV3Descriptor(pluginId: string, manifest: PluginManifest): PluginDescriptor {
  const { provides, uses, ui, entry } = manifest
  const owned = <T extends object>(items?: T[]) =>
    (items ?? []).map((item) => ({ ...item, pluginId }))
  const trusted = uses?.permissions?.find(
    (permission) => String(permission.name) === 'runtime.trusted'
  )
  return {
    runtime: 3,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author ?? manifest.publisher,
    homepage: manifest.homepage,
    hasShareResolver: Boolean(entry.share),
    providers: owned(provides?.providers),
    importers: owned(provides?.importers),
    lyricConverters: owned(provides?.lyricConverters),
    accounts: owned(provides?.accounts),
    actions: owned(provides?.actions),
    services: owned(provides?.services),
    guestAdapters: owned(provides?.guestAdapters),
    permissions: owned(uses?.permissions),
    dependencies: (uses?.plugins ?? []).map(({ pluginId: targetPluginId, ...dependency }) => ({
      ...dependency,
      pluginId,
      targetPluginId
    })),
    views: owned(entry.views),
    pages: owned(ui?.pages),
    homeSections: owned(ui?.homeSections),
    slots: owned(ui?.slots),
    menus: owned(ui?.menus),
    styles: owned(ui?.styles),
    regions: owned(ui?.regions),
    skins: owned(ui?.skins),
    server: entry.server && { ...entry.server, pluginId },
    nativeModules: owned(entry.native),
    trusted: trusted && { optional: trusted.optional === true, reason: trusted.reason }
  }
}
