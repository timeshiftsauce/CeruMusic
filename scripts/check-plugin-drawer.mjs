import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { readArtifact } from '@shiqianjiang/ceru-plugin-issuer'

const baseURL = process.env.CERU_PREVIEW_URL || 'http://localhost:5173'
const artifact = readArtifact(
  await readFile(resolve('../CeruMusic-Plugin-Template/plugins/ceru.navidrome/plugin.js'), 'utf8')
)
const compiled = await (await fetch(baseURL + '/src/components/Settings/plugins.vue')).text()
const vueModule = compiled.match(/from\s+["']([^"']+\/vue\.js[^"']*)["']/)?.[1]
assert.ok(vueModule, 'Renderer Vite server must be running')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  page.on('pageerror', (error) => {
    errors.push(error.message)
    console.error(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) console.error(response.status(), response.url())
  })
  await page.route('**/src/services/pluginState.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `import {ref} from '${vueModule}'; export const pluginContributions=ref([]); export const refreshPluginContributions=async()=>{};`
    })
  )
  await page.route('**/src/store/LocalUserDetail.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export const LocalUserDetailStore=()=>window.testStore;'
    })
  )
  await page.route('**/src/components/ServicePlugin/ImportPlaylist.vue*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export default {render(){return null}};'
    })
  )
  await page.addInitScript(
    ({ manifest, schema }) => {
      let sequence = 0
      const initial = () => ({
        status: '尚未连接',
        connected: false,
        serverUrl: '',
        username: '',
        quality: 'original',
        allowLocal: true,
        remember: false,
        showCovers: false
      })
      let state = initial()
      const plugin = {
        pluginId: 'fixture',
        pluginInfo: manifest,
        manifest,
        enabled: false,
        disabled: true,
        supportedSources: { navidrome: { name: 'Navidrome', qualitys: ['original'] } }
      }
      window.testStore = { initialization: true, userInfo: {}, init() {} }
      window.drawerFixture = {
        declareSettingsPage(enabled) {
          if (enabled) manifest.contributes.settingsPages = [{ id: 'debug', title: '开发调试页', view: 'debug' }]
          else delete manifest.contributes.settingsPages
        },
        show(placement = 'right') {
          window.setTestSession({
            sessionId: String(++sequence),
            pluginId: 'fixture',
            surfaceId: 'connection',
            schema: { ...schema, presentation: { ...schema.presentation, placement } },
            state
          })
        }
      }
      window.api = {
        plugins: {
          loadAllPlugins: async () => [structuredClone(plugin)],
          getManifest: async () => ({ data: manifest }),
          getPermissions: async () => ({ data: [] }),
          guestList: async () => [],
          setActive: async () => {
            plugin.enabled = true
            plugin.disabled = false
            window.drawerFixture.show()
            return { success: true }
          },
          setEnabled: async (_id, enabled) => {
            plugin.enabled = enabled
            window.setTestSession(null)
            return { success: true }
          },
          openSurface: async () => window.drawerFixture.show(),
          closeDrawer: async () => {},
          drawerAction: async (_id, _view, _session, index, values) => {
            await new Promise((resolve) => setTimeout(resolve, 50))
            if (index === -1) {
              if (!values.serverUrl || !values.username) throw new Error('请填写服务器地址和用户名')
              if (values.password === 'wrong') throw new Error('用户名或密码错误')
              state = { ...values, connected: true, status: '已连接 · Navidrome' }
              delete state.password
            } else if (schema.root.children[index].input?.mode === 'disconnect') state = initial()
            return state
          }
        }
      }
    },
    { manifest: artifact.header.manifest, schema: artifact.resources['schema.connection'].value }
  )
  await page.route('**/__plugin_drawer_preview', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="zh"><meta charset="utf-8"><style>body{margin:0;background:#f7f8fa;font-family:system-ui}#app{padding:24px}[data-app-titlebar]{height:76px;box-sizing:border-box;padding:24px;-webkit-app-region:drag;background:#fff}</style><header data-app-titlebar>设置</header><div id="app"></div><script type="module">
    import {createApp,h,ref} from '${vueModule}';
    import PluginSettings from '/src/components/Settings/plugins.vue';
    import PluginDrawer from '/src/components/PluginDrawer.vue';
    const session=ref(null); window.setTestSession=(value)=>session.value=value;
    createApp({setup() {
      return () => [h(PluginSettings), h(PluginDrawer, {
        session: session.value,
        onClose: () => { session.value = null },
        onState: (id, state) => {
          if (session.value?.sessionId === id) session.value = {...session.value, state}
        }
      })]
    }}).mount('#app');
  </script></html>`
    })
  )
  await page.goto(baseURL + '/__plugin_drawer_preview', { waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ path: resolve('node_modules/tdesign-vue-next/es/style/index.css') })
  const row = page.locator('.plugin-item').first()
  try {
    await row.getByRole('button', { name: '使用', exact: true }).click({ timeout: 15000 })
  } catch (error) {
    console.error(await page.locator('body').innerText())
    throw error
  }
  const drawer = page.locator('.t-drawer__content-wrapper')
  await page.locator('.t-drawer__header').filter({ hasText: 'Navidrome 连接' }).waitFor()
  assert.equal(
    await page
      .locator('.t-drawer__close-btn')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')),
    'no-drag'
  )
  assert.equal(
    (await page.locator('.t-drawer__mask').boundingBox()).y,
    76,
    'mask leaves the native titlebar uncovered'
  )
  assert.equal(browser.contexts()[0].pages().length, 1, 'use opens an in-app drawer')
  await page.locator('input[name="serverUrl"]').fill('https://music.example.test')
  await page.locator('input[name="username"]').fill('Demo user')
  await page.getByLabel('密码', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: '验证并保存', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '用户名或密码错误' }).waitFor()
  assert.equal(await page.getByLabel('密码', { exact: true }).inputValue(), '')
  assert.equal(await page.locator('input[name="username"]').inputValue(), 'Demo user')
  await page.getByLabel('密码', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: '验证并保存', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '已连接' }).waitFor()
  await page.screenshot({ path: join(tmpdir(), 'ceru-drawer-right.png') })
  for (const placement of ['left', 'top', 'bottom', 'right']) {
    await page.evaluate((placement) => window.drawerFixture.show(placement), placement)
    await page.locator('.t-drawer--' + placement).waitFor()
    await page.waitForTimeout(350)
    const box = await drawer.boundingBox()
    assert.ok(
      box && box.x >= -1 && box.y >= 75 && box.x + box.width <= 1101 && box.y + box.height <= 801,
      placement + ' fits viewport'
    )
  }
  await page.locator('[data-app-titlebar]').evaluate((element) => {
    element.style.height = '96px'
  })
  await page.waitForFunction(
    () => document.querySelector('.t-drawer__content-wrapper').getBoundingClientRect().top === 96
  )
  await page.locator('[data-app-titlebar]').evaluate((element) => {
    element.style.height = '76px'
  })
  await page.locator('.t-drawer__close-btn').click()
  await drawer.waitFor({ state: 'hidden' })
  await row.getByRole('button', { name: '配置', exact: true }).click()
  await page.getByLabel('密码', { exact: true }).fill('unsaved-password')
  await page.locator('.t-drawer__mask').click({ position: { x: 20, y: 20 } })
  await drawer.waitFor({ state: 'hidden' })
  await row.getByRole('button', { name: '配置', exact: true }).click()
  assert.equal(await page.getByLabel('密码', { exact: true }).inputValue(), '')
  await page.keyboard.press('Escape')
  await page.locator('.t-drawer__content-wrapper').waitFor({ state: 'hidden' })
  await row.getByRole('button', { name: '更多插件操作' }).click()
  const menu = page.locator('.t-dropdown__menu').filter({ hasText: '查看日志' })
  await menu.waitFor()
  assert.equal(await menu.getByText('Navidrome 连接', { exact: true }).count(), 0, 'primary settings has only the dedicated configuration button')
  assert.equal(await menu.getByText('卸载插件', { exact: true }).count(), 1)
  await page.locator('.plugins-title-row').click()
  await menu.waitFor({ state: 'hidden' })
  await page.evaluate(() => window.drawerFixture.declareSettingsPage(true))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await row.getByRole('button', { name: '更多插件操作' }).click()
  await menu.getByText('开发调试页', { exact: true }).waitFor()
  await page.locator('.plugins-title-row').click()
  await menu.waitFor({ state: 'hidden' })
  await page.evaluate(() => window.drawerFixture.declareSettingsPage(false))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await row.getByRole('button', { name: '配置', exact: true }).click()
  await page.locator('.t-drawer__header').filter({ hasText: 'Navidrome 连接' }).waitFor()
  assert.equal(await page.getByLabel('密码', { exact: true }).inputValue(), '')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(350)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: join(tmpdir(), 'ceru-drawer-mobile.png') })
  await page.getByRole('button', { name: '断开连接', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '尚未连接' }).waitFor()
  assert.equal(await page.locator('input[name="serverUrl"]').inputValue(), '')
  assert.deepEqual(errors, [])
  console.log(
    'PASS: real Settings use button, native drawer, form failure/success, password clearing, reconnect, four placements, dynamic titlebar inset, no-drag close button, overlay/Escape dismissal and 390px layout. Screenshots: ' +
      join(tmpdir(), 'ceru-drawer-right.png') +
      ', ' +
      join(tmpdir(), 'ceru-drawer-mobile.png')
  )
} finally {
  await browser.close()
}
