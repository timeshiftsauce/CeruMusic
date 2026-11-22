import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'

const outside = (root, target) => {
  const path = relative(root, target)
  return (
    path === '..' ||
    path.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) ||
    isAbsolute(path)
  )
}

// Store only hashes and plugin enabled/order state, never config or credential values.
export async function inspectPluginDirectory(directory) {
  if ((await lstat(directory)).isSymbolicLink()) throw Error('Plugin directory must not be a link')
  const root = await realpath(directory)
  const files = Object.create(null)
  let state
  const visit = async (folder) => {
    const entries = await readdir(folder, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    for (const entry of entries) {
      const path = join(folder, entry.name)
      if (entry.isSymbolicLink()) throw Error('Refusing linked entry: ' + relative(root, path))
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) {
        const name = relative(root, path).replaceAll('\\', '/')
        const bytes = await readFile(path)
        if (name === 'state.json') {
          state = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
          assert.ok(
            state && typeof state === 'object' && !Array.isArray(state),
            'Invalid state.json'
          )
        } else files[name] = createHash('sha256').update(bytes).digest('hex')
      } else throw Error('Unsupported entry: ' + relative(root, path))
    }
  }
  await visit(root)
  assert.ok(state, 'Missing state.json; choose the plugins directory of the test profile')
  return { schemaVersion: 1, files, state }
}

export function comparePluginSnapshots(before, after) {
  assert.equal(before?.schemaVersion, 1, 'Unsupported baseline')
  assert.ok(before.files && before.state, 'Invalid baseline')
  const removed = [],
    changed = [],
    stateChanged = []
  for (const [name, hash] of Object.entries(before.files)) {
    if (!Object.hasOwn(after.files, name)) removed.push(name)
    else if (after.files[name] !== hash) changed.push(name)
  }
  for (const [id, value] of Object.entries(before.state)) {
    if (!Object.hasOwn(after.state, id) || !isDeepStrictEqual(value, after.state[id]))
      stateChanged.push(id)
  }
  return {
    passed: !removed.length && !changed.length && !stateChanged.length,
    existingFiles: Object.keys(before.files).length,
    removed,
    changed,
    stateChanged,
    added: Object.keys(after.files).filter((name) => !Object.hasOwn(before.files, name)),
    addedState: Object.keys(after.state).filter((id) => !Object.hasOwn(before.state, id))
  }
}

async function main() {
  const [command, directory, baseline, ...extra] = process.argv.slice(2)
  if (!['snapshot', 'compare'].includes(command) || !directory || !baseline || extra.length)
    throw Error(
      'Usage: node verify-plugin-retention.mjs snapshot|compare <plugins directory> <baseline.json>'
    )
  const root = await realpath(resolve(directory))
  const output = resolve(baseline)
  const actualOutput = join(await realpath(dirname(output)), basename(output))
  if (!outside(root, actualOutput)) throw Error('Baseline must be outside the plugins directory')
  const snapshot = await inspectPluginDirectory(resolve(directory))
  if (command === 'snapshot') {
    await writeFile(output, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ saved: output, files: Object.keys(snapshot.files).length }))
  } else {
    const before = JSON.parse((await readFile(output, 'utf8')).replace(/^\uFEFF/, ''))
    const result = comparePluginSnapshots(before, snapshot)
    console.log(JSON.stringify(result, null, 2))
    if (!result.passed) process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
