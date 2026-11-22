#!/usr/bin/env node
// 手工联调脚本：验证「拖入插件文件」入口在主窗口里的实际行为。
// 用法：先 node node_modules/electron-vite/bin/electron-vite.js build
//       再 env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/electron.exe . --remote-debugging-port=9223
//       然后 env -u ELECTRON_RUN_AS_NODE node scripts/verify-drop-install.mjs
import { chromium } from 'playwright'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9223'
const root = await mkdtemp(join(tmpdir(), 'ceru-drop-'))
const pluginPath = join(root, 'drop-fixture.js')
const manifest = {
  manifestVersion: 2,
  id: 'verify.drop.fixture',
  name: '拖入测试插件',
  version: '1.2.3',
  description: '由 verify-drop-install.mjs 生成',
  author: 'ceru',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } }
}
await writeFile(
  pluginPath,
  `exports.manifest = ${JSON.stringify(manifest)};\nexports.activate = async function () {};\n`
)

const browser = await chromium.connectOverCDP(CDP_URL)
const fail = (message) => {
  throw new Error(message)
}
try {
  const pages = browser.contexts().flatMap((context) => context.pages())
  const page = pages.find((item) => item.url().includes('#/home'))
  if (!page) fail(`未找到主窗口，当前页面：${pages.map((item) => item.url()).join(', ')}`)

  // 1. 拖拽遮罩：模拟带 Files 的 dragenter，应出现提示层。
  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([''], 'probe.js', { type: 'text/javascript' }))
    window.dispatchEvent(
      new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true })
    )
  })
  const overlay = page.locator('.plugin-drop-overlay')
  if ((await overlay.count()) !== 1) fail('拖拽文件时没有出现安装提示层')
  const overlayText = (await overlay.innerText()).replace(/\s+/g, ' ').trim()
  if (!overlayText.includes('松开即可安装插件')) fail(`提示层文案异常：${overlayText}`)

  // 2. dragend 后提示层应消失。
  await page.evaluate(() => window.dispatchEvent(new DragEvent('dragend')))
  await page.waitForTimeout(300)
  if ((await page.locator('.plugin-drop-overlay').count()) !== 0) fail('拖拽结束后提示层仍然存在')

  // 3. 走完整安装链路：把探测到的真实路径交给同一条 IPC。
  const queued = await page.evaluate(
    (file) => window.api.plugins.queueExternalFile(file),
    pluginPath
  )
  if (!queued || typeof queued.sequence !== 'number') fail('queueExternalFile 没有返回 sequence')

  const dialog = page.locator('.t-dialog').filter({ hasText: '安装插件' }).first()
  await dialog.waitFor({ state: 'visible', timeout: 10000 })
  const body = (await dialog.innerText()).replace(/\s+/g, ' ')
  if (!body.includes('拖入测试插件') || !body.includes('1.2.3'))
    fail(`安装确认弹窗内容异常：${body}`)

  // 4. 取消安装后不应留下插件。
  await dialog.getByRole('button', { name: '取消' }).click()
  await page.waitForTimeout(800)
  const installed = await page.evaluate(async () =>
    (await window.api.plugins.loadAllPlugins()).map((item) => item.pluginInfo.id)
  )
  if (installed.includes('verify.drop.fixture')) fail('取消安装后插件仍被写入')

  // 5. 非法路径必须被拒绝。
  const rejected = await page.evaluate(async () => {
    try {
      await window.api.plugins.queueExternalFile('relative/plugin.js')
      return ''
    } catch (error) {
      return String(error?.message || error)
    }
  })
  if (!rejected.includes('路径无效')) fail(`非法路径未被拒绝：${rejected}`)

  console.log('PASS: 拖入提示层显隐、真实路径入队、安装确认弹窗、取消不落盘、非法路径拒绝')
} finally {
  await browser.close()
  await rm(root, { recursive: true, force: true })
}
