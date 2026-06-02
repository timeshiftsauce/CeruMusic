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
import UnoCSS from 'unocss/vite'
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
          }
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
          },
          /**
           * 手动拆分 vendor chunks —— 只对 node_modules 内的大包分组,
           * 业务代码不动,避免破坏模块初始化顺序导致 build 后异常。
           *
           * 拆分目标:
           *  - vendor-vue        Vue + 周边运行时(高频共用,放在主入口附近)
           *  - vendor-tdesign    UI 组件库(体积大,跨多个页面用)
           * - vendor-amll       Apple Music 歌词渲染器(只在 FullPlay 用,可懒)
           *  - vendor-tfjs       TensorFlow.js (仅 nsfwCheck 路径用,已 dynamic import)
           *  - vendor-logto      Logto 鉴权
           *  - vendor-socketio   Socket.IO client (一起听用)
           *  - vendor-misc       其余 node_modules,合并防止碎片化
           */
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            // 匹配优先级从特定到一般
            if (
              /[\\/]node_modules[\\/]@vue[\\/]/.test(id) ||
              /[\\/]node_modules[\\/]vue[\\/]/.test(id)
            ) {
              return 'vendor-vue'
            }
            if (
              /[\\/]node_modules[\\/]pinia[\\/]/.test(id) ||
              /[\\/]node_modules[\\/]vue-router[\\/]/.test(id)
            ) {
              return 'vendor-vue'
            }
            if (/[\\/]node_modules[\\/]tdesign-vue-next[\\/]/.test(id)) {
              return 'vendor-tdesign'
            }
            if (/[\\/]node_modules[\\/]@applemusic-like-lyrics[\\/]/.test(id)) {
              return 'vendor-amll'
            }
            if (
              /[\\/]node_modules[\\/]@tensorflow[\\/]/.test(id) ||
              /[\\/]node_modules[\\/]nsfwjs[\\/]/.test(id)
            ) {
              return 'vendor-tfjs'
            }
            if (/[\\/]node_modules[\\/]@logto[\\/]/.test(id)) {
              return 'vendor-logto'
            }
            if (
              /[\\/]node_modules[\\/]socket\.io-client[\\/]/.test(id) ||
              /[\\/]node_modules[\\/]engine\.io-client[\\/]/.test(id)
            ) {
              return 'vendor-socketio'
            }
            /* 其它 node_modules 都打到 vendor-misc,避免每个小依赖单独成 chunk */
            return 'vendor-misc'
          }
        }
      }
    },
    plugins: [
      UnoCSS(),
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
