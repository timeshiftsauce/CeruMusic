import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk'
import { ROUTABLE_PLUGIN_CAPABILITIES } from '@common/pluginCapabilities'

/** Protocol names belong to the app; custom action copy belongs to the plugin. */
export function describePluginCapability(
  capability: string,
  manifest: Pick<PluginManifest, 'name' | 'contributes'>
): { label: string; description: string } {
  const fallback = ROUTABLE_PLUGIN_CAPABILITIES[capability]
  if (capability.startsWith('action:')) {
    const command = manifest.contributes?.commands?.find(
      (entry) => entry.action === capability.slice('action:'.length)
    )
    const title = command?.title.trim()
    if (title)
      return {
        label: title,
        description:
          command?.description?.trim() || fallback?.[1] || `由${manifest.name}提供${title}功能`
      }
  }
  return fallback
    ? { label: fallback[0], description: fallback[1] }
    : {
        label: `扩展能力 · ${capability}`,
        description: `由${manifest.name}注册，当前澜音未接入此能力的统一分配`
      }
}
