import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { build as buildBrowserLibrary, type Plugin } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { TDesignResolver } from '@tdesign-vue-next/auto-import-resolver'
import wasm from 'vite-plugin-wasm'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import topLevelAwait from 'vite-plugin-top-level-await'

function desktopViewLibrary(): Plugin {
  const entry = resolve(__dirname, 'src/renderer/src/plugin/desktopComponents.ts')
  return {
    name: 'desktop-player-view-library',
    async buildStart() {
      this.addWatchFile(entry)
      const result = await buildBrowserLibrary({
        root: __dirname,
        configFile: false,
        publicDir: false,
        plugins: [vue()],
        build: {
          write: false,
          lib: { entry, formats: ['iife'], name: 'DesktopComponents' },
          rollupOptions: { external: ['vue'], output: { globals: { vue: 'desktopVue' }, exports: 'named' } }
        }
      })
      const files = (Array.isArray(result) ? result : [result]).flatMap(part => 'output' in part ? part.output : [])
      const entryChunk = files.find(file => file.type === 'chunk' && file.isEntry)
      const stylesheet = files.find(file => file.type === 'asset' && file.fileName.endsWith('.css'))
      if (entryChunk?.type !== 'chunk' || stylesheet?.type !== 'asset') throw Error('Missing desktop component library output')
      for (const id of entryChunk.moduleIds) if (!id.startsWith('\0')) this.addWatchFile(id.split('?')[0])
      this.emitFile({ type: 'asset', fileName: 'desktop-components.json', source: JSON.stringify({
        factory: 'function(desktopVue){' + entryChunk.code + '\nreturn DesktopComponents}',
        styles: Buffer.from(stylesheet.source).toString('utf8')
      }) })
    }
  }
}
export default defineConfig(({ command }) => ({
  main: {
    plugins: [desktopViewLibrary()],
    resolve: {
      alias: {
        '@common': resolve('src/common')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          downloadWorker: resolve(__dirname, 'src/main/workers/downloadWorker.ts')
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
    build: { externalizeDeps: { exclude: ['@electron-toolkit/preload'] } },
    resolve: {
      alias: {
        '@common': resolve('src/common')
      }
    }
  },
  renderer: {
    // Local runtime packages can change without a version bump during development.
    // Keep their ESM live so Vite does not retain a previous vendor archive.
    optimizeDeps: {
      exclude: ['@shiqianjiang/ceru-plugin-sdk', '@shiqianjiang/ceru-plugin-core/component-runtime'],
      include: ['@applemusic-like-lyrics/core', '@applemusic-like-lyrics/vue', 'qrcode']
    },
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
            // The injected Vue SDK imports TDesign at module initialization.
            // Keep it beside TDesign to avoid a misc -> TDesign -> misc cycle.
            if (/[\\/]@shiqianjiang[\\/]ceru-plugin-sdk[\\/]dist[\\/]vue[\\/]/.test(id)) {
              return 'vendor-tdesign'
            }
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
        dts: command === 'serve'
      }),
      Components({
        resolvers: [
          TDesignResolver({
            library: 'vue-next'
          }),
          NaiveUiResolver()
        ],
        dts: command === 'serve'
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
}))
