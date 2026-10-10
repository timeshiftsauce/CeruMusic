/**
 * 验证 external-media-integration 的事件回调链路。
 *
 * 用法：node scripts/test-emi-events.cjs
 *
 * 它注册回调后等待，期间你需要在系统媒体卡片上按「下一首 / 播放 / 暂停」。
 * 预期输出：`>>> 收到事件: {"type":"NextSong", ...}`（不是 null）。
 */
const path = require('node:path')
const os = require('node:os')

const nodePath = path.resolve(
  __dirname,
  '..',
  'native',
  'external-media-integration',
  'external-media-integration.node'
)

const m = require(nodePath)
m.initialize(path.join(os.tmpdir(), 'emi-event-test'))
m.enableSystemMedia()

let count = 0
m.registerEventHandler((eventJson) => {
  count++
  let event = eventJson
  try {
    event = typeof eventJson === 'string' ? JSON.parse(eventJson) : eventJson
  } catch {}
  const ok = event !== null && event !== undefined && typeof event.type === 'string'
  console.log(`>>> 收到事件 #${count}:`, JSON.stringify(event), ok ? '✅' : '❌ (type 缺失!)')
})

console.log('已启用 SMTC 并注册回调。请在 20 秒内于系统媒体控件上按几下按钮...')

setTimeout(() => {
  m.disableSystemMedia()
  m.shutdown()
  console.log(`\n总计收到 ${count} 个事件`)
  process.exit(count > 0 ? 0 : 2)
}, 20000)
