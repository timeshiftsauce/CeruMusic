import assert from 'node:assert/strict'
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { readPluginArtifact } from '@shiqianjiang/ceru-plugin-core'
import { ServiceRouter } from '@shiqianjiang/ceru-plugin-core/services'

if (!process.argv[2]) throw Error('Pass the local v3 toolchain checkout')
const desktop = fileURLToPath(new URL('../', import.meta.url)),
  toolchain = resolve(process.argv[2])
const require = createRequire(import.meta.url),
  dist = dirname(require.resolve('@shiqianjiang/ceru-plugin-core/node'))
// Keep the copied worker beneath the checkout so its package imports resolve
// through the same installed dependencies as the real desktop runtime.
const scratch = await mkdtemp(join(desktop, '.contract-drill-'))
const overlay = {
  name: 'test-only-extension',
  setup(builder) {
    builder.onLoad({ filter: /[\\/]contract\.ts$/ }, async ({ path }) => ({
      loader: 'ts',
      contents: (await readFile(path, 'utf8')).replace(
        "'services.app.getInfo':",
        "'services.app.getLocale': { permission: null }, 'services.app.getInfo':"
      )
    }))
    builder.onLoad({ filter: /[\\/]hostServices\.ts$/ }, async ({ path }) => ({
      loader: 'ts',
      contents: (await readFile(path, 'utf8')).replace(
        "'services.app.getInfo':",
        "'services.app.getLocale': async () => app.getLocale(), 'services.app.getInfo':"
      )
    }))
    builder.onResolve(
      {
        filter:
          /^(electron|\.\/sharing|\.\/uiBridge|\.\/musicRegistry|\.\/operations\/(?:bus|track))$/
      },
      ({ path }) => ({
        path,
        namespace: 'fixture'
      })
    )
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
      contents:
        "export const app={getLocale:()=> 'test-locale'}, BrowserWindow={}, clipboard={}, dialog={}, globalShortcut={}, nativeTheme={}, Notification=class {}, shell={}, createShareDescriptor=()=>{}, readShareDescriptor=()=>{}, callPluginUI=()=>{}, musicRegistry={}, libraryBus={}, sharingBus={}, linkBus={}, notificationBus={}, windowBus={}, operationTrack=()=>{}"
    }))
  }
}
let worker
try {
  await Promise.all(['assets', 'dist'].map((name) => mkdir(join(scratch, name))))
  await writeFile(join(scratch, 'package.json'), JSON.stringify({ type: 'module' }))
  await cp(dist, join(scratch, 'dist'), { recursive: true })
  for (const name of ['node-globals.js', 'catalog.json'])
    await copyFile(join(dist, '../assets', name), join(scratch, 'assets', name))
  await Promise.all([
    build({
      entryPoints: [join(toolchain, 'packages/core/runtime/sandbox.ts')],
      bundle: true,
      platform: 'browser',
      format: 'iife',
      target: 'es2022',
      plugins: [overlay],
      outfile: join(scratch, 'assets/sandbox.js')
    }),
    build({
      stdin: {
        contents:
          "export {CONTRACT} from './packages/core/src/contract'; export {createDispatcher} from './packages/core/src/dispatch'",
        resolveDir: toolchain
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      plugins: [overlay],
      outfile: join(scratch, 'dispatch.cjs')
    }),
    build({
      entryPoints: [join(desktop, 'src/main/services/plugin/hostServices.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      plugins: [overlay],
      outfile: join(scratch, 'host.cjs')
    })
  ])
  const { createDispatcher } = require(join(scratch, 'dispatch.cjs'))
  const { HostServices } = require(join(scratch, 'host.cjs'))
  const { NodePluginSandbox } = await import(pathToFileURL(join(scratch, 'dist/node.js')).href)
  const { artifact } = readPluginArtifact(
    'exports.manifest = ' +
      JSON.stringify({
        manifestVersion: 3,
        id: 'test.drill',
        name: 'Drill',
        version: '1.0.0',
        engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
        entry: { logic: { module: 'logic.main' } },
        provides: { actions: [{ id: 'probe', title: 'Probe' }] }
      }) +
      ';\nexports.activate=function(ctx){ctx.actions.register("probe",()=>ctx.app.getLocale())};'
  )
  const services = new HostServices(
    () => 'test.drill',
    () => false,
    () => {}
  ).bindV3(
    async () => {
      throw Error('Unexpected fallback')
    },
    new ServiceRouter().connect(
      artifact.header.manifest,
      async () => {
        throw Error('Unexpected service')
      },
      () => {}
    )
  )
  const dispatch = createDispatcher(services, {
    manifest: artifact.header.manifest,
    pluginId: 'test.drill',
    authorize: async () => {
      throw Error('Unexpected permission')
    },
    log: console
  })
  worker = new NodePluginSandbox(dispatch, () => {})
  await worker.start(artifact)
  assert.equal(await worker.invoke('action', 'probe', '', []), 'test-locale')
  assert.equal(
    Object.hasOwn(
      require('@shiqianjiang/ceru-plugin-core/contract').CONTRACT,
      'services.app.getLocale'
    ),
    false
  )
  console.log(
    'Real worker called getLocale with only two in-memory source changes; installed contract untouched.'
  )
} finally {
  await worker?.dispose()
  assert.equal(dirname(scratch), resolve(desktop))
  assert.ok(basename(scratch).startsWith('.contract-drill-'))
  await rm(scratch, { recursive: true, force: true, maxRetries: 3 })
}
