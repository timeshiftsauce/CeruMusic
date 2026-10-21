import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Upstream has not published the Titanium renderer or the lyric brightness optimization yet.
const commit = '5fee356362353dbb24ce9bea3a62536478040de7'
const sourceHash = '8cf33903e3ea4c7b0660add3f2e37bd135979431d9db8cd22a02f41cf2bfe151'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = join(root, '.tmp/amll')
const source = join(work, 'source')
const core = join(source, 'packages/core')
const destination = join(root, 'vendor/amll')
const archive = join(work, 'upstream.tar.gz')

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    // Windows .cmd entry points need cmd.exe. All arguments below are fixed local paths.
    shell: process.platform === 'win32'
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `${command} failed`)
}

await mkdir(source, { recursive: true })
await mkdir(destination, { recursive: true })
let data
try {
  data = await readFile(archive)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  const response = await fetch(
    `https://api.github.com/repos/amll-dev/applemusic-like-lyrics/tarball/${commit}`,
    { headers: { 'User-Agent': 'CeruMusic-development' } }
  )
  assert.ok(response.ok, `Cannot download AMLL: HTTP ${response.status}`)
  data = Buffer.from(await response.arrayBuffer())
  await writeFile(archive, data)
}
assert.equal(createHash('sha256').update(data).digest('hex'), sourceHash, 'AMLL archive changed')
run('tar', ['-xzf', archive, '-C', source, '--strip-components=1'], root)

// Install the build tools in isolation; the application supplies the existing runtime dependencies.
await writeFile(
  join(source, 'package.json'),
  JSON.stringify(
    {
      private: true,
      type: 'module',
      dependencies: {
        tsdown: '0.22.14',
        '@tsdown/css': '0.22.14',
        typescript: '6.0.3',
        '@types/deep-freeze': '0.1.5',
        '@types/ungap__structured-clone': '1.2.0'
      }
    },
    null,
    2
  )
)
run('npm', ['install', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], source)
run(process.execPath, [join(source, 'node_modules/tsdown/dist/run.mjs')], core)

const manifest = JSON.parse(await readFile(join(core, 'package.json'), 'utf8'))
manifest.version = `0.6.0+git.${commit.slice(0, 7)}`
manifest.gitHead = commit
manifest.ceruUpstream = `https://github.com/amll-dev/applemusic-like-lyrics/tree/${commit}`
manifest.dependencies['@ungap/structured-clone'] = '^1.3.3'
manifest.dependencies.vitest = '^4.1.10'
// Include the matching sources and license for the unpublished snapshot.
manifest.files = ['dist', 'src', 'LICENSE']
delete manifest.devDependencies
delete manifest.scripts
delete manifest.nx
await writeFile(join(core, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
await copyFile(join(source, 'LICENSE'), join(core, 'LICENSE'))
run('npm', ['pack', '--pack-destination', destination], core)
console.log(`AMLL core snapshot built from ${commit}`)
