import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { parse, compileScript, compileStyleAsync } from '@vue/compiler-sfc'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const root = resolve('src/renderer/src/components/search')
const output = resolve('.workflow/search-history')
await mkdir(output, { recursive: true })

let styles = []
const mock = {
  // 只保留搜索 store,避免入口拉入整个 @renderer/store
  '@renderer/store': `export { searchValue as useSearchStore } from './store/search'`,
  '@renderer/store/LocalUserDetail': `export const LocalUserDetailStore = () => ({ userSource: { source: 'wy' } })`
}

await build({
  stdin: {
    contents: `
import { createApp, h, toRaw } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import SearchSuggest from '../../components/search/searchSuggest.vue'
import { useSearchStore } from '@renderer/store'

// 组件源码里的 toRaw 平时由 unplugin-auto-import 注入,这里手动补上
window.toRaw = toRaw
window.__events = []
window.api = { music: { requestSdk: async (method) => method === 'tipSearch' ? { order: ['songs'], songs: [{ name: '晴天', artist: { name: '周杰伦' } }, { name: '晴天娃娃', artist: { name: '林俊杰' } }] } : null } }
const App = { render() { return h(SearchSuggest, { onToSearch: (keyword, type) => window.__events.push([keyword, type]) }) } }
const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.component('SvgIcon', { props: ['name', 'depth'], render: () => h('i', { class: 'svg-stub' }) })
app.use(naive)
app.mount('#app')
window.__store = useSearchStore(pinia)
`,
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  format: 'iife',
  outfile: join(output, 'preview.js'),
  loader: { '.ttf': 'dataurl' },
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
  },
  plugins: [
    {
      name: 'sfc',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => {
          if (Object.hasOwn(mock, a.path)) return { path: a.path, namespace: 'mock' }
          if (a.path.startsWith('@renderer/')) return { path: resolve('src/renderer/src', a.path.slice(10)) }
          if (a.path.startsWith('@common/')) {
            const p = resolve('src/common', a.path.slice(8))
            return { path: existsSync(p + '.ts') ? p + '.ts' : p }
          }
          return undefined
        })
        b.onLoad({ filter: /.*/, namespace: 'mock' }, (a) => ({
          contents: mock[a.path],
          resolveDir: resolve('src/renderer/src')
        }))
        b.onLoad({ filter: /\.vue$/ }, async (a) => {
          const { descriptor, errors } = parse(await readFile(a.path, 'utf8'), { filename: a.path })
          if (errors.length) throw errors[0]
          const id = 'data-v-' + Buffer.from(a.path).toString('hex').slice(-18)
          for (const s of descriptor.styles) {
            const compiled = await compileStyleAsync({
              source: s.content,
              filename: a.path,
              id,
              scoped: s.scoped,
              preprocessLang: s.lang,
              preprocessCustomRequire: (id) => require(id === 'sass' ? 'sass-embedded' : id)
            })
            if (compiled.errors.length) throw compiled.errors[0]
            styles.push(compiled.code)
          }
          const script = compileScript(descriptor, { id, inlineTemplate: true, genDefaultAs: 'component' })
          return {
            contents: script.content + `\ncomponent.__scopeId=${JSON.stringify(id)}; export default component`,
            loader: 'ts',
            resolveDir: dirname(a.path)
          }
        })
      }
    }
  ]
})

await writeFile(join(output, 'preview.css'), styles.join('\n'))
await writeFile(
  join(output, 'index.html'),
  `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="preview.css"><style>:root{--td-brand-color:#fa6487;--td-brand-color-light:#fff0f4;--n-border-color:rgba(80,80,80,.18)}body{margin:0;background:#1d1d1d;font-family:Arial,'Microsoft YaHei',sans-serif}#app{position:relative;width:520px;margin:80px auto}</style><div id="app"></div><script src="preview.js"></script>`
)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(pathToFileURL(join(output, 'index.html')).href)
  const card = page.locator('.search-suggest')

  // 1) 未聚焦时不渲染任何面板
  assert.equal(await card.count(), 0)

  // 2) 聚焦且输入为空:展示搜索历史(最新在前,去重)
  await page.evaluate(() => {
    const s = window.__store
    s.addHistory('周杰伦')
    s.addHistory('晴天')
    s.addHistory('周杰伦')
    s.setFocus(true)
  })
  await card.waitFor({ state: 'visible' })
  assert.deepEqual(await page.locator('.history-item .name').allTextContents(), ['周杰伦', '晴天'])
  assert.equal(await page.locator('.history-header .clear').textContent(), '清除')
  assert.equal(await page.locator('.direct, .all-suggest').count(), 0)
  // 历史面板必须有真实高度(高度计算覆盖了历史块,否则卡片高度为 0 不可见)
  const historyHeight = await card.evaluate((e) => e.getBoundingClientRect().height)
  assert.ok(historyHeight > 40, `history card should have real height, got ${historyHeight}`)
  await page.screenshot({ path: join(output, 'search-history.png') })

  // 3) 点击历史条目 → 以 keyword 类型触发搜索
  await page.locator('.history-item').first().click()
  assert.deepEqual(await page.evaluate(() => window.__events), [['周杰伦', 'keyword']])

  // 4) 输入关键字:切换为「直接搜索 + 建议」,历史不再出现
  await page.evaluate(() => window.__store.setValue('晴'))
  await page.locator('.all-suggest .suggest-item').first().waitFor({ state: 'visible' })
  assert.equal(await page.locator('.direct').textContent(), '直接搜索：晴')
  assert.equal(await page.locator('.history-item').count(), 0)
  assert.equal(await page.locator('.all-suggest .suggest-item').count(), 2)

  // 5) 点击建议 → 事件携带建议词与分组类型
  await page.locator('.all-suggest .suggest-item').first().click()
  assert.deepEqual(await page.evaluate(() => window.__events), [
    ['周杰伦', 'keyword'],
    ['晴天', 'songs']
  ])

  // 6) 清空输入:回到历史面板,旧建议被丢弃(不残留)
  await page.evaluate(() => window.__store.setValue(''))
  await page.locator('.history-item').first().waitFor({ state: 'visible' })
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.all-suggest').count(), 0, 'stale suggestions must be dropped when input is cleared')

  // 7) 清除按钮:历史清空,面板关闭
  await page.locator('.history-header .clear').click()
  assert.equal(await page.evaluate(() => window.__store.history.length), 0)
  await card.waitFor({ state: 'detached' })

  // 8) 无历史时空聚焦同样不渲染
  await page.evaluate(() => window.__store.setFocus(false))
  await page.evaluate(() => window.__store.setFocus(true))
  await page.waitForTimeout(350)
  assert.equal(await card.count(), 0)

  assert.deepEqual(errors, [])
  console.log('PASS: empty focus shows persisted history newest-first, with real card height')
  console.log('PASS: history click and suggestion click emit the search payload, clearing the input drops stale suggestions')
  console.log('PASS: clear button wipes history and closes the panel; no history means no panel')
} finally {
  await browser.close()
}
