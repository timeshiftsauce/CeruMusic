/// <reference types='jest' />
import { getRendererManualChunk } from './rendererManualChunks'

describe('renderer manual chunks', () => {
  it('should split framework, ui and lyric renderer dependencies into dedicated chunks', () => {
    expect(getRendererManualChunk('/project/node_modules/vue/dist/vue.runtime.esm-bundler.js')).toBe(
      'vendor-framework'
    )
    expect(getRendererManualChunk('/project/node_modules/tdesign-vue-next/es/index.mjs')).toBe(
      'vendor-ui-tdesign'
    )
    expect(getRendererManualChunk('/project/node_modules/naive-ui/es/button/index.mjs')).toBe(
      'vendor-ui-naive'
    )
    expect(
      getRendererManualChunk('/project/node_modules/@applemusic-like-lyrics/core/index.js')
    ).toBe('vendor-lyrics')
    expect(getRendererManualChunk('/project/node_modules/@pixi/app/lib/index.js')).toBe(
      'vendor-lyrics'
    )
  })

  it('should keep application source files in the default chunk graph', () => {
    expect(getRendererManualChunk('/project/src/renderer/src/main.ts')).toBeUndefined()
  })
})
