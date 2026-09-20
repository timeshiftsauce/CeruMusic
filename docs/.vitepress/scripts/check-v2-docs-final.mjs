import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(process.argv[2] ?? '.')
const docs = join(root, 'docs')
const guide = join(docs, 'guide', 'plugins', 'v2')
const publicRoot = join(docs, 'public')
const config = await readFile(join(docs, '.vitepress', 'config.mts'), 'utf8')

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(file)))
    else files.push(file)
  }
  return files
}

const markdownFiles = (await walk(guide)).filter((file) => extname(file) === '.md')
const tutorialFiles = (await walk(join(publicRoot, 'plugins', 'v2', 'tutorial'))).filter(
  (file) => !file.endsWith('.zip')
)
const textFiles = [...markdownFiles, ...tutorialFiles].filter((file) => {
  const extension = extname(file).toLowerCase()
  return ['.md', '.json', '.ts', '.js', '.vue', '.html'].includes(extension)
})

const forbidden = /聆澜音源|澜音源|2\.0\+|≥2\.0|(?:SDK|CLI).{0,30}从.{0,30}版本/u
for (const file of textFiles) {
  const source = await readFile(file, 'utf8')
  assert.doesNotMatch(source, forbidden, `禁用术语或版本历史: ${relative(root, file)}`)
}

function routeCandidates(route) {
  const clean = route.split('#', 1)[0].split('?', 1)[0]
  if (!clean) return []
  if (clean.startsWith('/plugins/')) {
    return [join(publicRoot, clean.slice(1))]
  }
  if (clean.startsWith('/guide/')) {
    const file = join(docs, clean.slice(1))
    return [file, file + '.md', join(file, 'index.md')]
  }
  return []
}

async function assertRoute(route, from) {
  if (route === '/' || /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/iu.test(route)) return
  const candidates = route.startsWith('/')
    ? routeCandidates(route)
    : (() => {
        const target = resolve(dirname(from), route.split('#', 1)[0].split('?', 1)[0])
        return [target, target + '.md', join(target, 'index.md')]
      })()
  assert.ok(candidates.length && (await Promise.any(candidates.map(async (file) => {
    if (await exists(file)) return true
    throw new Error('missing')
  })).catch(() => false)), `链接不存在: ${route} (${relative(root, from)})`)
}

const markdownLink = /!?(?:\[[^\]]*\])\(([^)\s]+)(?:\s+[^)]*)?\)/gu
for (const file of markdownFiles) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(markdownLink)) {
    const target = match[1].replaceAll('&amp;', '&')
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/iu.test(target)) continue
    await assertRoute(target, file)
  }
}

for (const match of config.matchAll(/link:\s*['"]([^'"]+)['"]/gu)) {
  await assertRoute(match[1], join(docs, 'guide', 'plugins', 'v2', 'index.md'))
}

const requiredRoutes = [
  '/guide/plugins/v2/quick-start',
  '/guide/plugins/v2/first-command',
  '/guide/plugins/v2/first-search',
  '/guide/plugins/v2/first-storage',
  '/guide/plugins/v2/first-release',
  '/guide/plugins/v2/tutorial-source/',
  '/guide/plugins/v2/tutorial-source/provider',
  '/guide/plugins/v2/tutorial-source/playback',
  '/guide/plugins/v2/tutorial-source/release',
  '/guide/plugins/v2/tutorial-navidrome/',
  '/guide/plugins/v2/tutorial-navidrome/connection',
  '/guide/plugins/v2/tutorial-navidrome/surface',
  '/guide/plugins/v2/tutorial-navidrome/provider',
  '/guide/plugins/v2/tutorial-navidrome/release',
  '/guide/plugins/v2/tutorial-account-native/',
  '/guide/plugins/v2/tutorial-account-native/manifest',
  '/guide/plugins/v2/tutorial-account-native/login',
  '/guide/plugins/v2/tutorial-account-native/native-library',
  '/guide/plugins/v2/tutorial-account-native/playback',
  '/guide/plugins/v2/tutorial-account-native/release'
]
for (const route of requiredRoutes) await assertRoute(route, join(docs, 'index.md'))

const zipNames = [
  'ceru-first-plugin.zip',
  'ceru-counter-page.zip',
  'ceru-http-source.zip',
  'ceru-navidrome-vue.zip',
  'ceru-settings-drawer.zip',
  'ceru-account-native.zip'
]

async function zipEntries(file) {
  const buffer = await readFile(file)
  const signature = 0x06054b50
  let end = -1
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--) {
    if (buffer.readUInt32LE(offset) === signature) {
      end = offset
      break
    }
  }
  assert.ok(end >= 0, `ZIP 目录损坏: ${file}`)
  const count = buffer.readUInt16LE(end + 10)
  const directorySize = buffer.readUInt32LE(end + 12)
  const directoryOffset = buffer.readUInt32LE(end + 16)
  assert.ok(directoryOffset + directorySize <= buffer.length, `ZIP 目录越界: ${file}`)
  const entries = []
  let offset = directoryOffset
  for (let index = 0; index < count; index++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, `ZIP 条目损坏: ${file}`)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    entries.push(normalize(buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

for (const name of zipNames) {
  const file = join(publicRoot, 'plugins', 'v2', 'tutorial', name)
  assert.ok(await exists(file), `下载包不存在: ${relative(root, file)}`)
  const entries = await zipEntries(file)
  assert.ok(entries.length > 0, `下载包为空: ${name}`)
  assert.ok(
    !entries.some((entry) => /(?:^|\/)(?:node_modules|dist|\.ceru-dev)(?:\/|$)/u.test(entry)),
    `下载包包含依赖或构建缓存: ${name}`
  )
}

console.log(
  `PASS: ${markdownFiles.length} v2 pages, sidebar routes, local links, ${zipNames.length} downloads, and tutorial terminology`
)
