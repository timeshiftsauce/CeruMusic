import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function rendererEntryArgument(): string {
  const entry = is.dev && process.env.ELECTRON_RENDERER_URL || pathToFileURL(join(__dirname, '../renderer/index.html')).href
  return '--ceru-renderer-entry=' + entry
}
