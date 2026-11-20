import { sniffManifestVersion } from '@shiqianjiang/ceru-plugin-issuer'
import { readPluginArtifact as readV2 } from 'ceru-plugin-core-v2'
import { readPluginArtifact as readV3 } from '@shiqianjiang/ceru-plugin-core'
import { readV2Descriptor } from './v2/manifest'
import { readV3Descriptor } from './v3/manifest'

export { sniffManifestVersion }
export type PluginRuntime = 2 | 3 | 'unknown'

export function readInstalledArtifact(code: string, version = sniffManifestVersion(code)) {
  if (version === 2) return { runtime: 2 as const, ...readV2(code) }
  if (version === 3) return { runtime: 3 as const, ...readV3(code) }
  if (version === 'legacy-comment') throw new Error('请通过 LX 兼容插件安装注释头插件')
  throw new Error('无法识别的插件文件')
}

export function describeInstalled(
  pluginId: string,
  parsed: ReturnType<typeof readInstalledArtifact>
) {
  return parsed.runtime === 2
    ? readV2Descriptor(pluginId, parsed.header.manifest)
    : readV3Descriptor(pluginId, parsed.header.manifest)
}
