import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { extractFile, listPackage } from '@electron/asar'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function checkPackagedFiles(target) {
  const archive = target.endsWith('.asar')
    ? resolve(target)
    : [
        join(resolve(target), 'resources/app.asar'),
        join(resolve(target), 'Contents/Resources/app.asar'),
        join(resolve(target), 'app.asar')
      ].find(existsSync)
  assert.ok(archive, 'Missing packaged application in: ' + target)
  const entries = listPackage(archive)
  const normalize = (file) => file.split(/[\\/]+/).filter(Boolean).join('/')
  const files = entries.map(normalize)
  const rejected = files.filter((file) => {
    if (!/^(?:out|resources|node_modules|native)(?:\/|$)|^(?:package\.json|EULA\.txt|LICENSE)$/.test(file)) return true
    if (/^native(?:\/|$)/.test(file)) return !/^native(?:\/external-media-integration(?:\/[^/]+\.node)?)?$/.test(file)
    return /(?:^|\/)(?:\.git|\.github|\.env(?:\.[^/]*)?|\.keys|\.vscode)(?:\/|$)|\.(?:map|tsbuildinfo|log|tgz|private\.pem)$|\.(?:test|spec)\.[^/]+$/.test(file) ||
      /(?:^|\/)node_modules\/(?:@esbuild|@rollup|@vitest|esbuild|rollup|vite|vitest)(?:\/|$)/.test(file)
  })
  assert.deepEqual(rejected.slice(0, 30), [], 'Unexpected development files in app.asar')
  const required = (file) => {
    assert.ok(files.includes(file), 'Missing packaged runtime file: ' + file)
    const bytes = extractFile(archive, join(...file.split('/')))
    assert.ok(bytes.length > 0, 'Empty packaged runtime file: ' + file)
    return bytes
  }
  const manifest = JSON.parse(required('package.json').toString())
  required(manifest.main.replace(/^\.\//, ''))
  required('out/preload/index.js')
  required('out/renderer/index.html')
  required('out/main/desktop-components.json')
  required('resources/logo.ico')
  required('LICENSE')
  required('EULA.txt')
  assert.ok(!manifest.devDependencies, 'Development dependencies leaked into packaged manifest')
  assert.ok(!manifest.scripts, 'Development scripts leaked into packaged manifest')
  for (const [name, expected] of [
    ['@shiqianjiang/ceru-plugin-core', '3.0.1'],
    ['@shiqianjiang/ceru-plugin-issuer', '3.0.1'],
    ['@shiqianjiang/ceru-plugin-sdk', '3.0.1'],
    ['ceru-plugin-core-v2', '0.3.16'],
    ['ceru-plugin-issuer-v2', '0.3.16'],
    ['ceru-plugin-sdk-v2', '0.3.16']
  ]) {
    const base = 'node_modules/' + name
    const dependency = JSON.parse(required(base + '/package.json').toString())
    assert.equal(dependency.version, expected, 'Wrong packaged runtime: ' + name)
    required(base + '/' + dependency.main.replace(/^\.\//, ''))
    if (name.includes('core')) required(base + '/assets/sandbox.js')
  }
  const component = 'node_modules/@shiqianjiang/ceru-plugin-core/assets/component-view.js'
  assert.deepEqual(gunzipSync(required(component + '.gz')), required(component))
  assert.ok(files.some((file) => /^node_modules\/better-sqlite3\/.*\.node$/.test(file)), 'SQLite native module missing')
  const unpacked = archive + '.unpacked'
  if (existsSync(unpacked)) {
    const walk = (directory, prefix = '') => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = prefix + entry.name
        assert.ok(files.includes(file), 'Unexpected unpacked file: ' + file)
        if (entry.isDirectory()) walk(join(directory, entry.name), file + '/')
      }
    }
    walk(unpacked)
  }
  console.log(`Packaged file boundary OK: ${files.length} entries; v2/v3 runtimes and native dependencies present (${basename(dirname(archive))}).`)
  return { archive, entries: files.length }
}

export default function afterPack(context) {
  const output = context.electronPlatformName === 'darwin'
    ? join(context.appOutDir, context.packager.appInfo.productFilename + '.app')
    : context.appOutDir
  checkPackagedFiles(output)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkPackagedFiles(process.argv[2] || join(root, 'dist/win-unpacked'))
}
