import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function verifyPluginDrop(page, directory) {
  const fixture = await readFile(new URL('../src/main/services/plugin/v3/__fixtures__/source-project.js', import.meta.url), 'utf8')
  const file = join(directory, 'drag-source.js')
  await writeFile(file, fixture)
  const before = await page.evaluate(async () => (await window.ceruQa.plugins.loadAllPlugins()).map(item => item.pluginId))
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.id = 'qa-plugin-file'
    document.body.append(input)
  })
  await page.locator('#qa-plugin-file').setInputFiles(file)
  await page.evaluate(() => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(document.querySelector('#qa-plugin-file').files[0])
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer, bubbles: true, cancelable: true }))
  })
  await page.locator('.plugin-drop-overlay').waitFor({ state: 'visible' })
  const prevented = await page.evaluate(() => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(document.querySelector('#qa-plugin-file').files[0])
    const event = new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
  assert.equal(prevented, true)
  const dialog = page.locator('.t-dialog').filter({ hasText: '安装插件' }).first()
  await dialog.waitFor({ state: 'visible', timeout: 15000 })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const after = await page.evaluate(async () => (await window.ceruQa.plugins.loadAllPlugins()).map(item => item.pluginId))
  assert.deepEqual(after, before)
  const rejected = await page.evaluate(async () => {
    try { await window.ceruQa.plugins.queueExternalFile('relative/plugin.js'); return false }
    catch { return true }
  })
  assert.equal(rejected, true)
  await page.locator('#qa-plugin-file').evaluate(input => input.remove())
  console.log('Packaged drag installation: real File path, private preload bridge, confirmation, cancellation, and relative-path rejection passed')
}
