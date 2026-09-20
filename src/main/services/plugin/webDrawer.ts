import { webContents, type WebContents } from 'electron'

const protectedContents = new WeakSet<WebContents>()
export function protectPluginFrames() {
  for (const contents of webContents.getAllWebContents()) {
    if (protectedContents.has(contents)) continue
    protectedContents.add(contents)
    contents.on('will-frame-navigate', event => {
      if (!event.isMainFrame &&
        (event.frame?.url.startsWith('about:srcdoc') || event.frame?.name.startsWith('ceru-plugin-surface-')) &&
        event.url !== 'about:srcdoc') event.preventDefault()
    })
  }
}
