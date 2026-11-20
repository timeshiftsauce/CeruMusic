import { desktopBridge } from '@renderer/services/desktopBridge'
import { computed, ref, watch, watchEffect } from 'vue'
import { mergeVisibility, providerEntryState, VisibilityDecisions } from './entryVisibility'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useAuthStore } from '@renderer/store/Auth'
import { reconcileSelectedSource, withSelectedMusicSource } from './musicSourceSelection'
import { canPersistMusicData } from './musicDataPersistence'
import {
  isRoutablePluginCapability,
  migratePluginCapabilitySelections
} from '@common/pluginCapabilities'

type ConditionalPage = { id: string; pluginId?: string; beforeSelect?: string; when?: { loggedIn?: boolean; selectedSource?: string; predicate?: string; combine?: 'all' | 'any' } }
const decisionRevision = ref(0)
const accountEpochs = ref(new Map<string,number>())
const decisions = new VisibilityDecisions(() => { decisionRevision.value++ })
const selectionContext = computed(() => {
  const info = LocalUserDetailStore().userInfo
  const source = info.selectSources && info.supportedSources && Object.hasOwn(info.supportedSources,info.selectSources) ? info.selectSources : null
  const installed = source ? selectableSourceOwners.value[source] : null
  const provider = installed && activePluginContributions.value.find(item => item.pluginId === installed)?.descriptor.id
  return {source,provider:provider || null}
})
const decisionKey = (page: ConditionalPage) => JSON.stringify([page.pluginId,page.id])
function currentSelection() {
  const {source,provider} = selectionContext.value
  return {selectedSource:source,selectedProvider:provider}
}
export async function readPluginSelection() {
  if (pluginRestorationComplete.value) return currentSelection()
  const store = LocalUserDetailStore()
  if (!store.initialization) store.init()
  const inventory = await desktopBridge.api.plugins.contributions()
  if (pluginRestorationComplete.value) return currentSelection()
  const source = store.userInfo.selectSources ?? null
  if (source === 'local') return {selectedSource:source,selectedProvider:null}
  const owner = source && store.userInfo.sourcePluginMap?.[source]
  const plugin = owner && inventory.find(item => item.pluginId === owner && (item.enabled || item.requestedEnabled) && item.descriptor.providers.some(provider => provider.id === source))
  return plugin ? {selectedSource:source,selectedProvider:plugin.descriptor.id} : {selectedSource:null,selectedProvider:null}
}
export function watchPluginSelection(publish: (value: ReturnType<typeof currentSelection>) => void) {
  return watch(() => pluginRestorationComplete.value ? JSON.stringify(currentSelection()) : null,
    (signature) => { if (signature !== null) publish(currentSelection()) }, {immediate:true})
}
const decisionSignature = (page: ConditionalPage) => JSON.stringify([selectionContext.value,page.when,accountEpochs.value.get(page.pluginId ?? '') ?? 0])
export function invalidatePageVisibility(pluginId: string) {
  accountEpochs.value.set(pluginId,(accountEpochs.value.get(pluginId) ?? 0) + 1)
}
export function watchPageVisibility() {
  const stopEvaluation = watchEffect(() => {
    const keys = new Set<string>()
    if (contributionsLoaded.value && pluginRestorationComplete.value) {
      for (const plugin of activePluginContributions.value) for (const kind of ['page','provider'] as const) for (const page of kind === 'page' ? plugin.descriptor.pages : plugin.descriptor.providers) {
        if (!page.when?.predicate) continue
        const key = kind === 'page' ? decisionKey(page) : 'provider:'+decisionKey(page), signature = decisionSignature(page), {source,provider} = selectionContext.value
        keys.add(key)
        void decisions.evaluate(key,signature,() => plugin.actionIds.includes(page.when.predicate) ? desktopBridge.api.plugins.evaluatePageVisibility(plugin.pluginId,page.id,source,provider,kind) : Promise.resolve(null))
      }
    }
    decisions.retain(keys)
  })
  const stopFallback = watchEffect(() => {
    if (!pluginRestorationComplete.value) return
    const store = LocalUserDetailStore(), source = store.userInfo.selectSources
    if (!source) return
    const owner = selectableSourceOwners.value[source]
    const state = implementationState(source,owner).state
    if (state !== 'disabled' && state !== 'hidden') return
    if (source !== 'local' && store.userInfo.supportedSources?.local) selectMusicSource('local')
    else store.userInfo.selectSources = ''
  })
  return () => { stopEvaluation(); stopFallback() }
}

function implementationState(source: string, owner?: string) {
  const plugin = activePluginContributions.value.find(item => item.pluginId === owner)
  const entry = plugin?.descriptor.providers.find((item: ConditionalPage) => item.id === source)
  const rule = entry?.when
  if (!rule) return {state:'available'} as const
  if (!pluginRestorationComplete.value) return {state:'pending'} as const
  const declared = rule.selectedSource !== undefined || rule.loggedIn !== undefined
  const matches = (rule.selectedSource === undefined || selectionContext.value.source === rule.selectedSource) && (rule.loggedIn === undefined || rule.loggedIn === useAuthStore().isAuthenticated)
  void decisionRevision.value
  return providerEntryState(declared ? matches : undefined,rule.predicate ? decisions.read('provider:'+decisionKey(entry),decisionSignature(entry)) : true,rule.combine)
}

export const sourcePickerEntries = computed(() => {
  const store = LocalUserDetailStore()
  return Object.entries(store.userInfo.supportedSources ?? {}).flatMap(([source,info]) => {
    const owners = activePluginContributions.value.filter(item => item.providerMethods?.[source] && item.descriptor.providers.some((provider: ConditionalPage) => provider.id === source))
    const split = owners.some(item => item.descriptor.providers.some((provider: ConditionalPage) => provider.id === source && (provider.when || provider.beforeSelect)))
    const candidates = split ? owners.map(item => item.pluginId) : [selectableSourceOwners.value[source]]
    return candidates.flatMap(owner => {
      const status = implementationState(source,owner)
      if (status.state === 'pending' || status.state === 'hidden') return []
      const plugin = owners.find(item => item.pluginId === owner), provider = plugin?.descriptor.providers.find((item: ConditionalPage) => item.id === source)
      return [{source,owner,split,key:JSON.stringify([source,owner]),name:(split ? provider?.name ?? info.name : info.name) || source,type:info.type,
        iconUrl:plugin?.providerIconUrls?.[source] ?? (!split ? providerIconUrls.value[source] : undefined),
        selected:store.userInfo.selectSources === source && selectableSourceOwners.value[source] === owner,
        disabled:status.state === 'disabled',reason:status.state === 'disabled' ? status.reason : undefined}]
    })
  })
})

let selectionAttempt: { id: string; cancel: AbortController } | undefined

export async function chooseSourceEntry(source: string, owner?: string) {
  const available = () => canPersistMusicData() && sourcePickerEntries.value.some(entry =>
    entry.source === source && !entry.disabled && (entry.owner === owner || (!entry.split &&
      LocalUserDetailStore().userInfo.selectSources === source && activePluginContributions.value.some(plugin =>
        plugin.pluginId === owner && plugin.providerMethods?.[source] && plugin.descriptor.providers.some((item: ConditionalPage) => item.id === source)))))
  if (!available()) return false
  selectionAttempt?.cancel.abort()
  const cancel = new AbortController(), id = crypto.randomUUID()
  selectionAttempt = {id, cancel}
  const store = LocalUserDetailStore()
  const plugin = activePluginContributions.value.find(item => item.pluginId === owner)
  const guard = plugin?.descriptor.providers.find((item: ConditionalPage) => item.id === source)?.beforeSelect
  const abort = () => { void desktopBridge.api.plugins.cancelProviderSelection(id).catch(() => {}) }
  try {
    if (guard && owner && !(store.userInfo.selectSources === source && selectableSourceOwners.value[source] === owner)) {
      cancel.signal.addEventListener('abort', abort, {once:true})
      const {selectedSource,selectedProvider} = currentSelection()
      if (!await desktopBridge.api.plugins.guardProviderSelection(id,owner,source,selectedSource,selectedProvider)) return false
      if (implementationState(source,owner).state === 'pending' && !cancel.signal.aborted) {
        await new Promise<void>(resolve => {
          const wait = AbortSignal.any([cancel.signal, AbortSignal.timeout(3500)])
          const finish = () => { stop(); wait.removeEventListener('abort', finish); resolve() }
          const stop = watch(() => implementationState(source,owner).state, state => { if (state !== 'pending') finish() })
          wait.addEventListener('abort', finish, {once:true})
        })
      }
    }
    if (cancel.signal.aborted || !available()) return false
    if (!owner || owner === selectableSourceOwners.value[source]) return selectMusicSource(source)
    const next = withSelectedMusicSource(store.userInfo, source)
    if (!next) return false
    selectableSourceOwners.value = {...selectableSourceOwners.value,[source]:owner}
    store.userInfo = {...next,sourcePluginMap:{...next.sourcePluginMap,[source]:owner}}
    await refreshPluginContributions(true)
    return !cancel.signal.aborted && store.userInfo.selectSources === source && selectableSourceOwners.value[source] === owner
  } finally {
    cancel.signal.removeEventListener('abort', abort)
    if (selectionAttempt?.id === id) selectionAttempt = undefined
  }
}
export function isPluginPageVisible(page: ConditionalPage): boolean {
  const rule = page.when
  if (!rule) return true
  if ((rule.selectedSource !== undefined || rule.predicate) && (!contributionsLoaded.value || !pluginRestorationComplete.value)) return false
  const declared = rule.selectedSource !== undefined || rule.loggedIn !== undefined
  const matched = (rule.selectedSource === undefined || rule.selectedSource === selectionContext.value.source) &&
    (rule.loggedIn === undefined || rule.loggedIn === useAuthStore().isAuthenticated)
  if (!rule.predicate) return matched
  void decisionRevision.value
  return mergeVisibility(declared ? matched : undefined, decisions.read(decisionKey(page),decisionSignature(page)),rule.combine)
}

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
const selectableSourceOwners = ref<Record<string,string>>({})
/** Saved user intent selects the initial page; it does not activate plugin capabilities. */
export const startupHomeAvailable = computed(() =>
  pluginContributions.value.some(
    (item) =>
      (item.enabled || (!pluginRestorationComplete.value && item.requestedEnabled)) &&
      (item.descriptor.homeSections.length ||
        item.descriptor.pages.some((page: any) => page.mount === 'home-tab' && isPluginPageVisible(page)))
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
  const owners = selectableSourceOwners.value
  const icons: Record<string, string> = {}
  for (const plugin of activePluginContributions.value) {
    for (const provider of plugin.descriptor.providers ?? []) {
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
          void desktopBridge.api.plugins
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
      const next = await desktopBridge.api.plugins.contributions()
      const changed = JSON.stringify(next) !== JSON.stringify(pluginContributions.value)
      const enabled = next.filter((item) => item.enabled)
      const selected =
        enabled.find((item) => item.pluginId === store.userInfo.pluginId) ??
        enabled.find((item) => item.descriptor.providers?.length)
      const implementations = enabled.flatMap(({ pluginId, descriptor }) =>
        (descriptor.providers ?? []).map((provider: any) => ({
          pluginId,
          pluginName: descriptor.name,
          provider
        }))
      )
      const selectionSnapshot = selectionFingerprint(store.userInfo)
      const sourcePluginMap = { ...(store.userInfo.sourcePluginMap ?? {}) }
      const previousSource = store.userInfo.selectSources
      const preferredOwner = previousSource && sourcePluginMap[previousSource]
      const retainsPreference = (source: string) => next.some(item => item.pluginId === sourcePluginMap[source] && item.descriptor.providers?.some(provider => provider.id === source))
      const activeSourceOwners: Record<string, string> = {}
      const sourceIds = [...new Set(implementations.map((item) => item.provider.id))]
      for (const source of sourceIds) {
        const options = implementations.filter((item) => item.provider.id === source)
        const saved = options.find((item) => item.pluginId === sourcePluginMap[source])
        activeSourceOwners[source] = (saved ?? options[0]).pluginId
        if (saved || !sourcePluginMap[source] || (restorationReady && !retainsPreference(source)))
          sourcePluginMap[source] = activeSourceOwners[source]
      }
      for (const source of Object.keys(sourcePluginMap))
        if (restorationReady && !sourceIds.includes(source) && !retainsPreference(source)) delete sourcePluginMap[source]
      const capabilityPluginMap = migratePluginCapabilitySelections(
        store.userInfo.capabilityPluginMap
      )
      const activeCapabilityOwners: Record<string, string> = {}
      for (const key of Object.keys(capabilityPluginMap)) {
        const [source, ...parts] = key.split(':')
        const capability = parts.join(':')
        const owner = enabled.find((item) => item.pluginId === capabilityPluginMap[key])
        const supported = capability.startsWith('action:')
          ? owner?.descriptor.providers?.some((provider: any) => provider.id === source) &&
            owner?.actionIds?.includes(capability.slice(7))
          : owner?.providerMethods?.[source]?.includes(capability)
        if (supported) activeCapabilityOwners[key] = capabilityPluginMap[key]
        else if (restorationReady) delete capabilityPluginMap[key]
      }
      const declaredProviders = sourceIds.map((source) => {
        const base = implementations.find(
          (item) => item.provider.id === source && item.pluginId === activeSourceOwners[source]
        )!.provider
        const resolvers = enabled.filter((item) =>
          item.providerMethods?.[source]?.includes('tracks.resolve')
        )
        const playbackId =
          activeCapabilityOwners[`${source}:tracks.resolve`] ??
          (resolvers.find((item) => item.pluginId === activeSourceOwners[source]) ?? resolvers[0])
            ?.pluginId
        const playback = implementations.find(
          (item) => item.provider.id === source && item.pluginId === playbackId
        )?.provider
        return { ...base, qualities: playback?.qualities ?? [] }
      })
      await Promise.all(
        Object.entries(activeSourceOwners).map(([source, pluginId]) =>
          desktopBridge.api.plugins.setProviderOwner(source, pluginId)
        )
      )
      await Promise.all(
        Object.keys(store.userInfo.capabilityPluginMap ?? {})
          .filter((key) => !activeCapabilityOwners[key])
          .map((key) => {
            const [source, ...parts] = key.split(':')
            return desktopBridge.api.plugins.setCapabilityOwner(source, parts.join(':'), null)
          })
      )
      await Promise.all(
        Object.entries(activeCapabilityOwners).map(([key, pluginId]) => {
          const [source, ...parts] = key.split(':')
          return desktopBridge.api.plugins.setCapabilityOwner(source, parts.join(':'), pluginId)
        })
      )
      const activeSources = await desktopBridge.api.plugins.musicSources()
      if (selectionSnapshot !== selectionFingerprint(store.userInfo)) {
        refreshAgain = true
        continue
      }
      const providers = activeSources.map(source => ({...source,qualities:declaredProviders.find(item => item.id === source.id)?.qualities ?? source.qualities})).sort((left,right) => Number(left.runtime === 'host')-Number(right.runtime === 'host'))
      selectableSourceOwners.value = Object.fromEntries(providers.filter(source => source.runtime !== 'host').map(source => [source.id, source.pluginId]))
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
        store.userInfo.pluginName = selected?.descriptor.name || ''
      }
      store.userInfo.sourcePluginMap = sourcePluginMap
      store.userInfo.capabilityPluginMap = capabilityPluginMap
      store.userInfo.selectSources = reconcileSelectedSource(previousSource, preferredOwner, providers, restorationReady)
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
  activePluginContributions.value.flatMap(({ pluginId, descriptor }) =>
    (descriptor.importers ?? []).map((item: any) => ({
      ...item,
      pluginId,
      publicId: descriptor.id + ':' + item.id,
      value: pluginId + ':' + item.id
    }))
  )
)

/** Native content contributed to the existing playlist page by running plugins. */
export const playlistSections = computed(() =>
  activePluginContributions.value
    .flatMap(({ pluginId, descriptor }) =>
      descriptor.pages
        .filter((page: any) => page.mount === 'playlist-section' && isPluginPageVisible(page))
        .filter((section: any) =>
          descriptor.views?.some((view: any) => view.id === section.view && (view.kind === 'native' || descriptor.runtime === 3))
        )
        .map((section: any) => ({
          ...section,
          pluginId,
          runtime: descriptor.runtime,
          key: JSON.stringify([pluginId, section.id])
        }))
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.key.localeCompare(b.key))
)

/** Plugin-declared entries for the existing import-method panel. */
export const playlistImportMenus = computed(() =>
  activePluginContributions.value.flatMap(({ pluginId, descriptor }) =>
    (descriptor.menus ?? [])
      .filter((menu: any) => menu.slot === 'playlist.import')
      .map((menu: any) => ({
        ...menu,
        pluginId,
        pluginName: descriptor.name,
        value: pluginId + ':' + menu.id
      }))
  )
)

export const homeSections = computed(() => {
  const selected = LocalUserDetailStore().userInfo.uiPluginMap ?? {}
  const sections = activePluginContributions.value.flatMap(({ pluginId, descriptor }) =>
    [
      ...descriptor.homeSections,
      ...descriptor.pages
        .filter((page: any) => page.mount === 'home-tab' && isPluginPageVisible(page))
        .map((page: any) => ({ ...page, kind: 'custom', runtime: descriptor.runtime }))
    ].map((item: any) => ({ ...item, pluginId }))
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
  activePluginContributions.value.flatMap(({ pluginId, descriptor }) =>
    (descriptor.providers ?? []).map((provider: any) => ({
      pluginId,
      pluginName: descriptor.name,
      providerId: provider.id,
      providerName: provider.name,
      qualities: provider.qualities ?? []
    }))
  )
)

const routingChanges = new Map<string, Promise<void>>()
export function selectMusicSource(source: string): boolean {
  if (!canPersistMusicData() || implementationState(source,selectableSourceOwners.value[source]).state !== 'available') return false
  const store = LocalUserDetailStore()
  const next = withSelectedMusicSource(store.userInfo, source)
  if (!next) return false
  const owner = selectableSourceOwners.value[source]
  if (owner && next.sourcePluginMap?.[source] !== owner)
    store.userInfo = { ...next, sourcePluginMap: { ...next.sourcePluginMap, [source]: owner } }
  else if (next !== store.userInfo) store.userInfo = next
  else store.persistUserInfo()
  return true
}

async function applyRoutingChange(key: string, change: () => Promise<void>) {
  const next = (routingChanges.get(key) ?? Promise.resolve()).catch(() => {}).then(change)
  routingChanges.set(key, next)
  try {
    await next
  } finally {
    if (routingChanges.get(key) === next) routingChanges.delete(key)
  }
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
    await desktopBridge.api.plugins.setCapabilityOwner(source, capability, pluginId)
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
