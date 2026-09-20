import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [sdkArgument, issuerArgument] = process.argv.slice(2)
if (!sdkArgument || !issuerArgument) {
  throw new Error(
    'Usage: node docs/.vitepress/scripts/refresh-sdk-reference.mjs <sdk-root> <issuer-root>'
  )
}
const sdkRoot = resolve(sdkArgument)
const issuerRoot = resolve(issuerArgument)
const sdk = JSON.parse(await readFile(resolve(sdkRoot, 'package.json'), 'utf8'))
const issuer = JSON.parse(await readFile(resolve(issuerRoot, 'package.json'), 'utf8'))
const groups = [
  [
    '上下文、账号与原生页面类型',
    ['index.d.ts', 'manifest.d.ts', 'accounts.d.ts', 'native-view.d.ts']
  ],
  ['宿主服务完整签名', ['services.d.ts', 'navigation.d.ts', 'library.d.ts']],
  ['存储类型', ['storage.d.ts']],
  ['网络与权限类型', ['http.d.ts', 'sockets.d.ts', 'permissions.d.ts']],
  ['歌词与音质类型', ['music.d.ts', 'lyrics.d.ts', 'quality.d.ts']],
  ['Guest 与分享类型', ['guests.d.ts', 'share.d.ts']],
  ['资源目录', ['catalog.d.ts']],
  [
    '工具与模块类型',
    [
      'modules.d.ts',
      'host-library.d.ts',
      'host-modules.d.cts',
      'legacy-http.d.ts',
      'compat/crypto.d.ts',
      'compat/encoding.d.ts',
      'compat/zlib.d.ts',
      'compat/format.d.ts'
    ]
  ]
]
let markdown =
  [
    '---',
    'pageClass: plugin-v2-doc',
    '---',
    '',
    '# 完整类型参考',
    '',
    '本页来自 **SDK ' +
      sdk.version +
      ' 构建验证包 / Issuer ' +
      issuer.version +
      '** 的实际声明文件。Guest、分享与 Storage 已包含在 SDK 的公开导出中，无需从桌面源码复制这些类型。',
    '',
    '::: info 安装版本',
    '本页按正式发布的 SDK 与 Issuer 声明生成。安装与升级方式见 [' +
      sdk.version +
      ' 工具链更新](./sdk-upgrade)。',
    ':::',
    '',
    '本页适合在写代码时查询参数和返回值。首次开发先从[动手教程](./quick-start)开始；功能能否运行还要看[宿主支持表](./host-services)。',
    '',
    '按需要展开下面一个领域即可，不必从头读完，也不要把跨文件声明整体粘进插件入口。'
  ].join('\n') + '\n'
for (const [heading, files] of groups) {
  markdown += '\n## ' + heading + '\n'
  for (const name of files) {
    const source = await readFile(resolve(sdkRoot, 'dist', name), 'utf8')
    markdown +=
      '\n::: details ' +
      name +
      ' · SDK ' +
      sdk.version +
      '\n\n' +
      '```ts\n' +
      source.trim() +
      '\n```\n\n:::\n'
  }
}
markdown +=
  '\n## 发行库类型\n\n用于作者后端和构建工具，不是插件沙箱服务。\n\n' +
  '::: details @shiqianjiang/ceru-plugin-issuer · ' +
  issuer.version +
  '\n\n```ts\n' +
  (await readFile(resolve(issuerRoot, 'dist/index.d.ts'), 'utf8')).trim() +
  '\n```\n\n:::\n\n类型与源码：[官方工具链仓库](https://github.com/CeruMusic/CeruMusic-Plugin-Cli)。声明保留原包 MIT 许可，见 [LICENSE](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/main/LICENSE)。\n'
const destination = fileURLToPath(new URL('../../guide/plugins/v2/reference.md', import.meta.url))
await writeFile(destination, markdown)
console.log('Updated reference for SDK ' + sdk.version)
