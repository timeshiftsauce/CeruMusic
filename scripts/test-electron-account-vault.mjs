import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { _electron as electron } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const directory = await mkdtemp(join(root, '.electron-vault-'))
const profile = join(directory, 'profile')
let application
try {
  await mkdir(profile)
  await build({ entryPoints: [join(root, 'src/main/services/plugin/accounts/vault.ts')], outfile: join(directory, 'vault.cjs'), platform: 'node', format: 'cjs', bundle: true, external: ['electron'] })
  const launcher = join(directory, 'launch.cjs')
  await writeFile(launcher, 'const {app}=require("electron"); app.setPath("userData",' + JSON.stringify(profile) + '); global.qaFs=require("node:fs/promises"); global.qaPath=require("node:path"); global.qaUuid=require("node:crypto").randomUUID; global.vault=require("./vault.cjs").pluginAccountVault;')
  application = await electron.launch({ args: [launcher] })
  const report = await application.evaluate(async ({ app }) => {
    await app.whenReady()
    const fs = global.qaFs, path = global.qaPath
    const owner = { pluginId: 'test.account', accountId: 'music' }
    const secret = 'local-qa-' + global.qaUuid()
    const first = await global.vault.create(owner, secret), second = await global.vault.create(owner, 'second-account')
    const folder = path.join(app.getPath('userData'), 'plugins', 'accounts')
    const files = (await fs.readdir(folder, { recursive: true })).filter(name => name.endsWith('.bin'))
    const privateOnDisk = (await Promise.all(files.map(file => fs.readFile(path.join(folder, file))))).every(data => !data.includes(secret) && !data.includes('second-account'))
    const decrypted = (await global.vault.read(owner, first)) === secret
    await global.vault.forget(owner, first)
    const removed = await global.vault.read(owner, first).then(() => false, () => true)
    const retained = (await global.vault.read(owner, second)) === 'second-account'
    await global.vault.forgetPlugin(owner.pluginId)
    return { count: files.length, privateOnDisk, decrypted, removed, retained, empty: !(await fs.readdir(folder)).length }
  })
  assert.deepEqual(report, { count: 2, privateOnDisk: true, decrypted: true, removed: true, retained: true, empty: true })
  console.log('Electron account vault: two encrypted records, host decrypt, independent deletion and plugin cleanup passed')
} finally { try { await application?.close() } finally { await rm(directory, { recursive: true, force: true }) } }
