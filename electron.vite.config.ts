import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { TDesignResolver } from '@tdesign-vue-next/auto-import-resolver'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@common': resolve('src/common')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@common': resolve('src/common')
      }
    }
  },
  renderer: {
    plugins: [
      vue(),
      vueDevTools(),
      wasm(),
      topLevelAwait(),
      AutoImport({
        resolvers: [
          TDesignResolver({
            library: 'vue-next'
          })
        ],
        dts: true
      }),
      Components({
        resolvers: [
          TDesignResolver({
            library: 'vue-next'
          })
        ],
        dts: true
      })
    ],
    base: './',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@assets': resolve('src/renderer/src/assets'),
        '@components': resolve('src/renderer/src/components'),
        '@services': resolve('src/renderer/src/services'),
        '@types': resolve('src/renderer/src/types'),
        '@store': resolve('src/renderer/src/store'),
        '@common': resolve('src/common')
      }
    }
  }
})
