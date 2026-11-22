// 验证 core 的 guest 沙箱桥是否暴露了 library 删除方法。
// 只读 assets/sandbox.js 文本，不启动 Electron / worker，纯静态断言。
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const sandboxPath = fileURLToPath(
  new URL('../node_modules/@shiqianjiang/ceru-plugin-core/assets/sandbox.js', import.meta.url)
)
const source = await readFile(sandboxPath, 'utf8')

// 方法表在压缩产物里形如 ["list","getTracks","import",...].map(...)
const match = source.match(/\[("?[A-Za-z]+"?(?:,"?[A-Za-z]+"?)*)\]\.map\([a-zA-Z_$]+=>\[[a-zA-Z_$]+,[a-zA-Z_$]+=>[a-zA-Z_$]+\("library\.playlists\."/s)

if (!match) {
  console.error('✗ 未能在 sandbox.js 中定位 library.playlists 方法表')
  process.exit(1)
}

const exposed = match[1].split(',').map((s) => s.replace(/"/g, '').trim())
const required = ['list', 'getTracks', 'import', 'removeTracks', 'clearPlaylist']
const missing = required.filter((m) => !exposed.includes(m))

console.log('沙箱暴露的 library.playlists 方法:', exposed.join(', '))

if (missing.length) {
  console.error('✗ 缺失方法:', missing.join(', '))
  process.exit(1)
}

console.log('✓ 删除能力已接入 guest 桥（removeTracks / clearPlaylist）')
