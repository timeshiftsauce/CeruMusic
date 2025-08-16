import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, bytecodePlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { TDesignResolver } from '@tdesign-vue-next/auto-import-resolver'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@electron-toolkit/utils']
      }),
      bytecodePlugin()
    ]
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@electron-toolkit/preload']
      }),
      bytecodePlugin()
    ]
  },
  renderer: {
    plugins: [
      vue(),
      AutoImport({
        resolvers: [
          TDesignResolver({
            library: 'vue-next'
          })
        ]
      }),
      Components({
        resolvers: [
          TDesignResolver({
            library: 'vue-next'
          })
        ]
      })
    ],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@assets': resolve('src/renderer/assets'),
        '@components': resolve('src/renderer/src/components'),
        '@services': resolve('src/renderer/src/services'),
        '@types': resolve('src/renderer/src/types'),
        '@store': resolve('src/renderer/src/store')
      }
    },
    build: {
      rollupOptions: {
        external: [
          'fs',
          'path',
          'os',
          'http',
          'https',
          'url',
          'net',
          'tls',
          'crypto',
          'stream',
          'util',
          'child_process',
          'assert',
          'dns',
          'querystring',
          'async_hooks',
          'zlib'
        ]
      }
    }
  }
})
