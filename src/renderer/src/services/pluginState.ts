import { computed, ref } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import {
  isRoutablePluginCapability,
  migratePluginCapabilitySelections
} from '@common/pluginCapabilities'

export const pluginContributions = ref<any[]>([])
export const pluginImportRequest = ref<{
  pluginId: string
  importerId?: string
  initialValue?: string
  title?: string
} | null>(null)
export const libraryRevision = ref(0)
export const contributionsLoaded = ref(false)
export const contributionsRevision = ref(0)
export const pluginRestorationComplete = ref(false)
/** Saved user intent selects the initial page; it does not activate plugin capabilities. */
export const startupHomeAvailable = computed(
  () =>
    pluginContributions.value.some(
      (item) =>
        (item.enabled || (!pluginRestorationComplete.value && item.requestedEnabled)) &&
        item.manifest.contributes?.homeSections?.length
    )
)
let pending: Promise<void> | undefined
let refreshAgain = false
let restorationStarted = false
let restorationSettled = false
let resolveUIReady: (() => void) | undefined
const uiReady = new Promise<void>((resolve) => {
  resolveUIReady = resolve
})
export function markPluginUIReady() {
  resolveUIReady?.()
  resolveUIReady = undefined
}

export const activePluginContributions = computed(() =>
  pluginContributions.value.filter((item) => item.enabled)
)
/** Provider artwork comes from its own running plugin's declared image resources. */
export const providerIconUrls = computed<Record<string, string>>(() => {
  const owners = LocalUserDetailStore().userInfo.sourcePluginMap ?? {}
  const icons: Record<string, string> = {}
  for (const plugin of activePluginContributions.value) {
    for (const provider of plugin.manifest.contributes?.providers ?? []) {
      if (owners[provider.id] && owners[provider.id] !== plugin.pluginId) continue
      const url = plugin.providerIconUrls?.[provider.id]
      if (typeof url === 'string' && /^data:image\/(svg\+xml|png|jpeg|webp|gif);base64,/.test(url))
        icons[provider.id] ??= url
    }
  }
  return icons
})

function selectionFingerprint(info: import('@renderer/types/userInfo').UserInfo) {
  return JSON.stringify([
    info.pluginId,
    info.selectSources,
    info.selectQuality,
    info.sourceQualityMap,
    info.sourcePluginMap,
    info.capabilityPluginMap,
    info.uiPluginMap
  ])
}

export async function refreshPluginContributions(force = false): Promise<void> {
  if (pending) {
    if (force) refreshAgain = true
    return pending
  }
  if (contributionsLoaded.value && !force) return
  pending = (async () => {
    do {
      refreshAgain = false
      const store = LocalUserDetailStore()
      if (!store.initialization) store.init()
      if (!contributionsLoaded.value) {
        await uiReady
        if (!restorationStarted) {
          restorationStarted = true
          // An unrelated plugin can wait for permission during activation.
          // Inventory refreshes and explicit use/close actions must stay available.
          void window.api.plugins
            .restoreEnabled()
            .catch((error) => console.warn('恢复插件失败:', error))
            .then(async () => {
              restorationSettled = true
              return refreshPluginContributions(true)
            })
            .catch((error) => console.warn('刷新插件失败:', error))
            .finally(() => {
              pluginRestorationComplete.value = true
            })
        }
      }
      const restorationReady = restorationSettled
      const next = await window.api.plugins.contributions()
      const changed = JSON.stringify(next) !== JSON.stringify(pluginContributions.value)
      const enabled = next.filter((item) => item.enabled)
      const selected =
        enabled.find((item) => item.pluginId === store.userInfo.pluginId) ??
        enabled.find((item) => item.manifest.contributes?.providers?.length)
      const implementations = enabled.flatMap(({ pluginId, manifest }) =>
        (manifest.contributes?.providers ?? []).map((provider: any) => ({
          pluginId,
          pluginName: manifest.name,
          provider
        }))
      )
      const selectionSnapshot = selectionFingerprint(store.userInfo)
      const sourcePluginMap = { ...(store.userInfo.sourcePluginMap ?? {}) }
      const activeSourceOwners: Record<string, string> = {}
      const sourceIds = [...new Set(implementations.map((item) => item.provider.id))]
      for (const source of sourceIds) {
        const options = implementations.filter((item) => item.provider.id === source)
        const saved = options.find((item) => item.pluginId === sourcePluginMap[source])
        activeSourceOwners[source] = (saved ?? options[0]).pluginId
        if (saved || restorationReady || !sourcePluginMap[source])
          sourcePluginMap[source] = activeSourceOwners[source]
      }
      for (const source of Object.keys(sourcePluginMap))
        if (restorationReady && !sourceIds.includes(source)) delete sourcePluginMap[source]
      const capabilityPluginMap = migratePluginCapabilitySelections(store.userInfo.capabilityPluginMap)
      const activeCapabilityOwners: Record<string, string> = {}
      for (const key of Object.keys(capabilityPluginMap)) {
        const [source, ...parts] = key.split(':')
        const capability = parts.join(':')
        const owner = enabled.find((item) => item.pluginId === capabilityPluginMap[key])
        const supported = capability.startsWith('action:')
          ? owner?.manifest.contributes?.providers?.some(
              (provider: any) => provider.id === source
            ) && owner?.actionIds?.includes(capability.slice(7))
          : owner?.providerMethods?.[source]?.includes(capability)
        if (supported) activeCapabilityOwners[key] = capabilityPluginMap[key]
        else if (restorationReady) delete capabilityPluginMap[key]
      }
      const providers = sourceIds.map((source) => {
        const base = implementations.find(
          (item) => item.provider.id === source && item.pluginId === activeSourceOwners[source]
        )!.provider
        const resolvers = enabled.filter(item => item.providerMethods?.[source]?.includes('tracks.resolve'))
        const playbackId = activeCapabilityOwners[`${source}:tracks.resolve`] ??
          (resolvers.find(item => item.pluginId === activeSourceOwners[source]) ?? resolvers[0])?.pluginId
        const playback = implementations.find(
          (item) => item.provider.id === source && item.pluginId === playbackId
        )?.provider
        return { ...base, qualities: playback?.qualities ?? [] }
      })
      await Promise.all(
        Object.entries(activeSourceOwners).map(([source, pluginId]) =>
          window.api.plugins.setProviderOwner(source, pluginId)
        )
      )
      await Promise.all(
        Object.keys(store.userInfo.capabilityPluginMap ?? {})
          .filter((key) => !activeCapabilityOwners[key])
          .map((key) => {
            const [source, ...parts] = key.split(':')
            return window.api.plugins.setCapabilityOwner(source, parts.join(':'), null)
          })
      )
      await Promise.all(
        Object.entries(activeCapabilityOwners).map(([key, pluginId]) => {
          const [source, ...parts] = key.split(':')
          return window.api.plugins.setCapabilityOwner(source, parts.join(':'), pluginId)
        })
      )
      if (selectionSnapshot !== selectionFingerprint(store.userInfo)) {
        refreshAgain = true
        continue
      }
      store.userInfo.supportedSources = Object.fromEntries(
        providers.map((item: any) => [
          item.id,
          { name: item.name, qualitys: item.qualities || [], icon: item.icon, type: 'music' }
        ])
      )
      if (
        restorationReady ||
        !store.userInfo.pluginId ||
        selected?.pluginId === store.userInfo.pluginId
      ) {
        store.userInfo.pluginId = selected?.pluginId || ''
        store.userInfo.pluginName = selected?.manifest.name || ''
      }
      store.userInfo.sourcePluginMap = sourcePluginMap
      store.userInfo.capabilityPluginMap = capabilityPluginMap
      if (
        (restorationReady || !store.userInfo.selectSources) &&
        !providers.some((item: any) => item.id === store.userInfo.selectSources)
      )
        store.userInfo.selectSources = providers[0]?.id || ''
      const qualities =
        providers.find((item: any) => item.id === store.userInfo.selectSources)?.qualities ?? []
      const savedQuality = store.userInfo.sourceQualityMap?.[store.userInfo.selectSources || '']
      const selectedOwner = sourcePluginMap[store.userInfo.selectSources || '']
      const ownerReady =
        !selectedOwner || activeSourceOwners[store.userInfo.selectSources || ''] === selectedOwner
      if (savedQuality && qualities.includes(savedQuality))
        store.userInfo.selectQuality = savedQuality
      else if (
        (restorationReady || (ownerReady && qualities.length)) &&
        !qualities.includes(store.userInfo.selectQuality)
      )
        store.userInfo.selectQuality = qualities.at(-1) || ''
      // Publish only after provider routing is ready. Pages may start requests on this change.
      if (changed) pluginContributions.value = next
      contributionsLoaded.value = true
      if (changed) contributionsRevision.value++
    } while (refreshAgain)
  })().finally(() => {
    pending = undefined
  })
  return pending
}

export const playlistImporters = computed(() =>
  activePluginContributions.value.flatMap(({ pluginId, manifest }) =>
    (manifest.contributes?.playlistImporters ?? []).map((item: any) => ({
      ...item,
      pluginId,
      value: pluginId + ':' + item.id
    }))
  )
)

/** Native content contributed to the existing playlist page by running plugins. */
export const playlistSections = computed(() =>
  activePluginContributions.value
    .flatMap(({ pluginId, manifest }) =>
      (manifest.contributes?.playlistSections ?? [])
        .filter((section: any) =>
          manifest.modules?.surfaces?.some(
            (view: any) => view.id === section.view && view.kind === 'native'
          )
        )
        .map((section: any) => ({
          ...section,
          pluginId,
          key: JSON.stringify([pluginId, section.id])
        }))
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key))
)

/** Plugin-declared entries for the existing import-method panel. */
export const playlistImportMenus = computed(() =>
  activePluginContributions.value.flatMap(({ pluginId, manifest }) =>
    (manifest.contributes?.menus ?? [])
      .filter((menu: any) => menu.slot === 'playlist.import')
      .map((menu: any) => ({
        ...menu,
        pluginId,
        pluginName: manifest.name,
        value: pluginId + ':' + menu.id
      }))
  )
)

export const homeSections = computed(() => {
  const selected = LocalUserDetailStore().userInfo.uiPluginMap ?? {}
  const sections = activePluginContributions.value.flatMap(({ pluginId, manifest }) =>
    (manifest.contributes?.homeSections ?? []).map((item: any) => ({ ...item, pluginId }))
  )
  return sections.filter((section) => {
    const matches = sections.filter((item) => item.kind === section.kind)
    if (matches.length <= 1 || section.kind === 'custom') return true
    const owner = matches.some((item) => item.pluginId === selected[`home:${section.kind}`])
      ? selected[`home:${section.kind}`]
      : matches[0].pluginId
    return section.pluginId === owner
  })
})

export const providerImplementations = computed(() =>
  activePluginContributions.value.flatMap(({ pluginId, manifest }) =>
    (manifest.contributes?.providers ?? []).map((provider: any) => ({
      pluginId,
      pluginName: manifest.name,
      providerId: provider.id,
      providerName: provider.name,
      qualities: provider.qualities ?? []
    }))
  )
)

const routingChanges = new Map<string, Promise<void>>()
async function applyRoutingChange(key: string, change: () => Promise<void>) {
  const next = (routingChanges.get(key) ?? Promise.resolve()).catch(() => {}).then(change)
  routingChanges.set(key, next)
  try {
    await next
  } finally {
    if (routingChanges.get(key) === next) routingChanges.delete(key)
  }
}

export async function selectProviderImplementation(source: string, pluginId: string) {
  return applyRoutingChange('provider:' + source, async () => {
    const store = LocalUserDetailStore()
    const implementation = providerImplementations.value.find(
      (item) => item.providerId === source && item.pluginId === pluginId
    )
    if (!implementation) throw new Error('该插件未提供当前平台')
    await window.api.plugins.setProviderOwner(source, pluginId)
    store.userInfo.sourcePluginMap = {
      ...(store.userInfo.sourcePluginMap ?? {}),
      [source]: pluginId
    }
    await refreshPluginContributions(true)
  })
}

export async function selectCapabilityImplementation(
  source: string,
  capability: string,
  pluginId: string | null
) {
  if (pluginId && !isRoutablePluginCapability(capability))
    throw new Error('插件内部操作不能分配给其他插件')
  return applyRoutingChange('capability:' + source + ':' + capability, async () => {
    const store = LocalUserDetailStore()
    const key = `${source}:${capability}`
    await window.api.plugins.setCapabilityOwner(source, capability, pluginId)
    const next = { ...(store.userInfo.capabilityPluginMap ?? {}) }
    if (pluginId) next[key] = pluginId
    else delete next[key]
    store.userInfo.capabilityPluginMap = next
    await refreshPluginContributions(true)
    contributionsRevision.value++
  })
}

export function selectUIImplementation(slot: string, pluginId: string | null) {
  const store = LocalUserDetailStore()
  const next = { ...(store.userInfo.uiPluginMap ?? {}) }
  if (pluginId) next[slot] = pluginId
  else delete next[slot]
  store.userInfo.uiPluginMap = next
}
