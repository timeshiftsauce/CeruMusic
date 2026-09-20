import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.vue'])

function collectSourceFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectSourceFiles(fullPath))
    else if (sourceExtensions.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

function importedPackages(files) {
  const packages = new Set()
  const importPattern = /(?:from\s+|import\s*|require\(\s*)['"]([^'"]+)['"]/g
  for (const file of files) {
    const source = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1]
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue
      packages.add(
        specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0]
      )
    }
  }
  return packages
}

const production = new Set(Object.keys(packageJson.dependencies ?? {}))
// Main-process packages can load these through their own runtime adapters.
// They must remain production dependencies even when app source imports them only in the renderer.
const indirectMainRuntime = new Set(['socket.io-client'])
const rendererPackages = importedPackages(collectSourceFiles(path.join(root, 'src', 'renderer')))
const mainPackages = importedPackages([
  ...collectSourceFiles(path.join(root, 'src', 'main')),
  ...collectSourceFiles(path.join(root, 'src', 'preload')),
  ...collectSourceFiles(path.join(root, 'src', 'common'))
])

const rendererOnly = [...production]
  .filter(
    (name) =>
      rendererPackages.has(name) && !mainPackages.has(name) && !indirectMainRuntime.has(name)
  )
  .sort()

const missingIndirectRuntime = [...indirectMainRuntime].filter((name) => !production.has(name)).sort()

if (missingIndirectRuntime.length > 0) {
  console.error('These indirect main-process runtime dependencies must stay in dependencies:')
  for (const name of missingIndirectRuntime) console.error(`  - ${name}`)
  process.exit(1)
}

if (rendererOnly.length > 0) {
  console.error(
    'These production dependencies are renderer-only and must be moved to devDependencies:'
  )
  for (const name of rendererOnly) console.error(`  - ${name}`)
  process.exit(1)
}

console.log(
  'Production dependency boundary OK: renderer-only imports are not shipped as production dependencies.'
)
