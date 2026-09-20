import { computed, shallowRef } from 'vue'
import type { AccountSummary } from '@shiqianjiang/ceru-plugin-sdk'
import { activePluginContributions } from './pluginState'

export const pluginAccountItems = computed(() =>
  activePluginContributions.value.flatMap(({ pluginId, manifest }) =>
    (manifest.contributes?.accountItems ?? []).map((item) => ({
      ...item,
      pluginId,
      key: `plugin-account:${pluginId}:${item.id}`
    }))
  )
)
export const pluginAccountSummaries = shallowRef<Record<string, AccountSummary>>({})
const revisions = new Map<string, number>()

/** Only public, plugin-declared summaries reach the account menu. */
export async function refreshPluginAccounts(pluginId?: string) {
  const items = pluginAccountItems.value
  const keys = new Set(items.map((item) => item.key))
  pluginAccountSummaries.value = Object.fromEntries(
    Object.entries(pluginAccountSummaries.value).filter(([key]) => keys.has(key))
  )
  await Promise.all(
    items
      .filter((item) => !pluginId || item.pluginId === pluginId)
      .map(async (item) => {
        const revision = (revisions.get(item.key) ?? 0) + 1
        revisions.set(item.key, revision)
        try {
          const summary = await window.api.plugins.accountSummary(item.pluginId, item.id)
          if (
            revisions.get(item.key) !== revision ||
            !pluginAccountItems.value.some((current) => current.key === item.key)
          )
            return
          pluginAccountSummaries.value = { ...pluginAccountSummaries.value, [item.key]: summary }
        } catch {
          if (revisions.get(item.key) !== revision) return
          const next = { ...pluginAccountSummaries.value }
          delete next[item.key]
          pluginAccountSummaries.value = next
        }
      })
  )
}
