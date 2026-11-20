import { isDeepStrictEqual } from 'node:util'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'

export function changedRegionViews(previous: Artifact, next: Artifact): string[] | null {
  if (previous.sourceFormat !== next.sourceFormat || previous.signatureStatus !== 'unsigned' ||
      next.signatureStatus !== 'unsigned' || !isDeepStrictEqual(previous.header, next.header) ||
      !isDeepStrictEqual(previous.resources, next.resources)) return null
  const keys = Object.keys(previous.modules)
  if (keys.length !== Object.keys(next.modules).length || keys.some(key => !Object.hasOwn(next.modules, key))) return null
  const manifest = next.header.manifest, entry = manifest.entry
  const regionViews = new Set(manifest.ui?.regions?.map(region => region.view))
  const changes = new Set<string>()
  for (const key of keys) {
    if (previous.modules[key] === next.modules[key]) continue
    if ([entry.logic?.module, entry.share?.module, entry.server?.module].includes(key)) return null
    const views = entry.views?.filter(view => view.module === key)
    if (!views?.length || views.some(view => view.kind !== 'component' || !regionViews.has(view.id))) return null
    for (const view of views) changes.add(view.id)
  }
  return [...changes]
}
