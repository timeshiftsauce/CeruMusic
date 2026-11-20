import type { Artifact } from 'ceru-plugin-issuer-v2'
import type { GuestInfo } from 'ceru-plugin-sdk-v2'

import { exportShareResolver as renderResolver } from '../shared/shareResolver'

export function exportShareResolver(
  artifact: Artifact,
  config: Record<string, unknown>,
  guest?: { script: string; info: GuestInfo }
): string {
  const manifest = artifact.header.manifest
  const declaration = manifest.modules.share
  return renderResolver(
    {
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      providers: manifest.contributes?.providers ?? [],
      declaration,
      factory: declaration && artifact.modules[declaration.entry]
    },
    config,
    guest
  )
}
