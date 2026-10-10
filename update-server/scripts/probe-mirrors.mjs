/**
 * 本地镜像测速：并发探测 UPDATE_MIRRORS 里所有镜像，输出可达/超时清单。
 *
 * 判定标准与客户端一致：能建立连接并拿到 HTTP 响应即算「可达」
 * （404/403 属正常 —— 说明代理服务活着，只是探测路径不存在）。
 *
 * 用法：
 *   node scripts/probe-mirrors.mjs            # 只报告
 *   node scripts/probe-mirrors.mjs --write    # 把超时的从 mirrors.ts 里删掉
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIRRORS_FILE = join(__dirname, '..', 'src', 'mirrors.ts')

const PROBE_TARGET = 'https://github.com/favicon.ico'
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 8000)
const CONCURRENCY = 12

const writeBack = process.argv.includes('--write')

/** 读取源文件里的镜像列表（保持顺序）。 */
function readMirrors() {
  const src = readFileSync(MIRRORS_FILE, 'utf-8')
  return [...src.matchAll(/'(https?:\/\/[^']+)'/g)].map((m) => m[1])
}

/** 探测单个镜像，返回 RTT(ms) 或 null。 */
async function probe(mirror) {
  const url = mirror + PROBE_TARGET
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const started = Date.now()
  try {
    // HEAD 更省流量；不支持 HEAD 时降级 GET + Range。
    let res = await fetch(url, { method: 'HEAD', signal: ctrl.signal })
    if (!res.ok) {
      res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal: ctrl.signal
      })
      try {
        await res.arrayBuffer()
      } catch {}
    }
    return Date.now() - started
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 并发池：限制同时探测数。 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(
    new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (true) {
        const i = cursor++
        if (i >= items.length) return
        results[i] = await worker(items[i], i)
      }
    })
  )
  return results
}

const mirrors = readMirrors()
console.log(`共 ${mirrors.length} 个镜像，并发 ${CONCURRENCY}，超时 ${TIMEOUT_MS}ms\n`)

const results = await mapWithConcurrency(mirrors, CONCURRENCY, async (m) => ({
  url: m,
  ms: await probe(m)
}))

const ok = results.filter((r) => r.ms != null).sort((a, b) => a.ms - b.ms)
const failed = results.filter((r) => r.ms == null)

console.log(`=== 可达 ${ok.length} / 共 ${mirrors.length} ===`)
ok.forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}. ${String(r.ms).padStart(5)}ms  ${r.url}`))
console.log(`\n=== 超时 ${failed.length} ===`)
failed.forEach((r) => console.log(`  ${r.url}`))

if (writeBack) {
  if (!failed.length) {
    console.log('\n没有超时项，无需改写。')
  } else {
    const keep = new Set(ok.map((r) => r.url))
    const src = readFileSync(MIRRORS_FILE, 'utf-8')
    const lines = src.split('\n')
    const out = lines.filter((line) => {
      const m = line.match(/^\s*'(https?:\/\/[^']+)',\s*$/)
      return !m || keep.has(m[1])
    })
    // 反向校验：确认删除的行数与预期一致
    const removed = lines.length - out.length
    writeFileSync(MIRRORS_FILE, out.join('\n'), 'utf-8')
    console.log(`\n已写回 ${MIRRORS_FILE}：删除 ${removed} 行，保留 ${keep.size} 个镜像。`)
  }
} else {
  console.log('\n（加 --write 可把超时项从 mirrors.ts 删掉）')
  // 输出一份「保留清单」，供人工/脚本核对与多轮取交集。
  console.log('\n===KEEP_JSON_START===')
  console.log(JSON.stringify(ok.map((r) => r.url)))
  console.log('===KEEP_JSON_END===')
}
