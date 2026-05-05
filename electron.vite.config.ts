import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { TDesignResolver } from '@tdesign-vue-next/auto-import-resolver'
import wasm from 'vite-plugin-wasm'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import topLevelAwait from 'vite-plugin-top-level-await'
export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@common': resolve('src/common')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          downloadWorker: resolve(__dirname, 'src/main/workers/downloadWorker.ts'),
          pluginWorker: resolve(__dirname, 'src/main/services/plugin/manager/pluginWorker.ts')
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'script/[name]-[hash].js',
          assetFileNames(chunkInfo) {
            if (chunkInfo.names[0].endsWith('.css')) return 'style/[name]-[hash].css'
            // 图片资源
            const imgReg = /\.(png|jpg|jpeg|gif|svg|webp)$/
            if (imgReg.test(chunkInfo.names[0])) return 'images/[name]-[hash].[ext]'
            // 其他资源
            return 'assets/[name]-[hash].[ext]'
          },
        }
      },
      minify: 'terser'
    }
  },
  preload: {
    resolve: {
      alias: {
        '@common': resolve('src/common')
      }
    }
  },
  renderer: {
    build: {
      chunkSizeWarningLimit: 1000,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      },
      rollupOptions: {
        output: {
          entryFileNames: 'script/[name]-[hash].js',
          chunkFileNames: 'script/[name]-[hash].js',
          assetFileNames(chunkInfo) {
            if (chunkInfo.names[0].endsWith('.css')) return 'style/[name]-[hash].css'
            // 图片资源
            const imgReg = /\.(png|jpg|jpeg|gif|svg|webp)$/
            if (imgReg.test(chunkInfo.names[0])) return 'images/[name]-[hash].[ext]'
            // 其他资源
            return 'assets/[name]-[hash].[ext]'
          }
        }
      }
    },
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
        imports: [
          'vue',
          {
            'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar']
          }
        ],
        dts: true
      }),
      Components({
        resolvers: [
          TDesignResolver({
            library: 'vue-next'
          }),
          NaiveUiResolver()
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
