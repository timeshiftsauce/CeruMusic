import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'

export async function useAuthorSdk(project, toolchain) {
  const source = join(toolchain, 'packages/sdk'), target = join(project, 'node_modules/@shiqianjiang/ceru-plugin-sdk')
  await mkdir(target, {recursive:true})
  await copyFile(join(source,'package.json'), join(target,'package.json'))
  await cp(join(source,'dist'), join(target,'dist'), {recursive:true})
}

export async function startVueWatch(toolchain, directory) {
  const project = join(directory, 'page-extension')
  const bin = resolve(toolchain, 'packages/cli/dist/bin.js')
  await promisify(execFile)(
    process.execPath,
    [bin, 'init', project, '--template', 'page-extension', '--lang', 'js'],
    { windowsHide: true }
  )
  const configPath = join(project, 'ceru.plugin.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  config.manifest.ui.styles = [
    { id: 'slot-style', resource: 'slot.css', scope: 'slot', slots: ['playlist.header.actions'] }
  ]
  config.resources = {
    ...config.resources,
    'slot.css': { path: 'src/slot.css', type: 'text', mime: 'text/css' }
  }
  await writeFile(configPath, JSON.stringify(config))
  await writeFile(join(project, 'src/slot.css'), ':root { --ceru-qa-slot: present }')
  const buttonPath = join(project, 'src/Open.vue')
  const button = await readFile(buttonPath, 'utf8')
  assert.ok(button.includes('<script setup>'))
  const setup = [
    '<script setup>',
    "import {useView} from '@shiqianjiang/ceru-plugin-sdk/vue'",
    'const {props} = useView()',
    "if (!Object.isFrozen(props) || props.slot !== 'playlist.header.actions' || Object.keys(props).length !== 1) throw Error('Invalid slot context')"
  ].join('\n')
  const dialogSetup = "import {ref} from 'vue'\nimport {Dialog} from 'tdesign-vue-next'\nconst visible=ref(false)\nconst opens=ref(0)"
  const dialog = '<button aria-label="歌曲详情" @click="opens++;visible=true">?</button><Dialog v-model:visible="visible" header="歌曲详情" width="420px" :close-on-esc-keydown="true"><p>打开次数 {{ opens }}</p></Dialog>'
  await writeFile(buttonPath, button.replace('<script setup>', setup+'\n'+dialogSetup).replace('</template>', dialog+'</template>'))
  const source = join(project, 'src/Search.vue')
  const original = await readFile(source, 'utf8')
  const changed = original.replace(/搜索(?=<\/Button\b)/, '重新搜索')
  assert.notEqual(original, changed)
  return Object.assign(await startProjectWatch(bin, project), { edit: () => writeFile(source, changed) })
}

export async function startProjectWatch(bin, project) {
  const probe = process.argv.includes('--type-probe') ? ['--import', new URL('./electron-watch-type-probe.mjs', import.meta.url).href] : []
  const worker = spawn(process.execPath, [...probe, bin, 'dev', '--project', project], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const lines = createInterface({ input: worker.stdout })
  const finished = new Promise((done, reject) => {
    worker.once('error', reject)
    worker.once('close', done)
  })
  const stop = async () => {
    if (worker.exitCode === null) worker.kill()
    await finished
    lines.close()
  }
  let timer,
    stderr = '',
    readyAt = 0
  worker.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-2000)
  })
  try {
    await Promise.race([
      new Promise((done, reject) => {
        timer = setTimeout(() => reject(Error('Initial CLI build timed out: ' + stderr)), 60000)
        lines.on('line', (line) => {
          if (probe.length && line.startsWith('CERU_QA_TYPES ')) console.log(line)
          if (line.startsWith('CERU_BUILD_READY ')) {
            readyAt = performance.now()
            done()
          }
          if (line.startsWith('CERU_ERROR ')) reject(Error(line))
        })
      }),
      finished.then((code) => {
        throw Error('Dev watcher exited: ' + code + ' ' + stderr)
      })
    ])
    return {
      file: join(project, 'dist/plugin.js'),
      get readyAt() {
        return readyAt
      },
      stop
    }
  } catch (error) {
    await stop()
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function addPreviewFile(application, page, file) {
  await application.evaluate(({ dialog }, path) => {
    const original = dialog.showOpenDialog
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = original
      return { canceled: false, filePaths: [path] }
    }
  }, file)
  const state = await page.evaluate(() => window.ceruQa.plugins.addDevFile())
  const entry = state.entries.find((row) => row.path === file)
  assert.ok(entry?.id && !entry.error, JSON.stringify(state))
  return entry
}

export async function verifyV2Preview(application, page, directory, code) {
  const file = join(directory, 'legacy-preview.js')
  await writeFile(file, code)
  const entry = await addPreviewFile(application, page, file)
  assert.equal(entry.runtime, 2)
  const search = () =>
    window.ceruQa.music.requestSdk('search', { source: 'early', keyword: '歌', limit: 5, page: 1 })
  assert.equal((await page.evaluate(search)).list[0].name, '第一首歌')
  const updated = code.replace('第一首歌', '第二首歌')
  await writeFile(file, updated)
  await page.waitForFunction(
    async () => {
      const result = await window.ceruQa.music.requestSdk('search', {
        source: 'early',
        keyword: '歌',
        limit: 5,
        page: 1
      })
      return result.list?.[0]?.name === '第二首歌'
    },
    undefined,
    { timeout: 10000, polling: 80 }
  )
  await page.evaluate((path) => window.ceruQa.plugins.removeDevFile(path), file)
  assert.equal(await readFile(file, 'utf8'), updated)
  console.log('v2 development file reloaded in its own worker and returned the edited song')
}
