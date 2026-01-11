import { ipcMain } from 'electron'
import { getFonts } from 'font-list'

export async function getSystemFonts() {
  try {
    const fonts = await getFonts()
    // remove quotes if any remain (font-list sometimes returns quoted strings)
    const cleanFonts = fonts.map((f) => f.replace(/"/g, ''))

    // Built-in fonts
    const builtInFonts = ['PingFangSC-Semibold', 'lyricfont']

    // Filter out built-in fonts from system list if they exist to avoid duplicates
    const systemFonts = cleanFonts.filter((f) => !builtInFonts.includes(f))

    return [...builtInFonts, ...systemFonts]
  } catch (error) {
    console.error('Error getting fonts:', error)
    return ['PingFangSC-Semibold', 'lyricfont']
  }
}

export default function initFontEvents() {
  ipcMain.handle('get-font-list', async () => {
    return await getSystemFonts()
  })
}
