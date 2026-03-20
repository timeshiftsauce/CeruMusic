const FRAMEWORK_PACKAGES = ['vue', 'vue-router', 'pinia', '@vueuse/core']
const TDESIGN_PACKAGES = ['tdesign-vue-next', 'tdesign-icons-vue-next']
const NAIVE_PACKAGES = ['naive-ui']
const LYRIC_PACKAGES = [
  '@applemusic-like-lyrics',
  '@lrc-player',
  '@pixi',
  'color-extraction'
]
const UTILS_PACKAGES = ['axios', 'lodash', 'crypto-js', 'dompurify', 'marked', 'jss']

const includesPackage = (id: string, packages: string[]) =>
  packages.some((pkg) => id.includes(`/node_modules/${pkg}/`) || id.includes(`/node_modules/${pkg}`))

export const getRendererManualChunk = (id: string) => {
  if (!id.includes('/node_modules/')) {
    return undefined
  }

  if (includesPackage(id, FRAMEWORK_PACKAGES)) {
    return 'vendor-framework'
  }

  if (includesPackage(id, TDESIGN_PACKAGES)) {
    return 'vendor-ui-tdesign'
  }

  if (includesPackage(id, NAIVE_PACKAGES)) {
    return 'vendor-ui-naive'
  }

  if (includesPackage(id, LYRIC_PACKAGES)) {
    return 'vendor-lyrics'
  }

  if (includesPackage(id, UTILS_PACKAGES)) {
    return 'vendor-utils'
  }

  return 'vendor-misc'
}
