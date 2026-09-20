#!/usr/bin/env node
// CDP 驱动脚本：通过 Playwright 连到正在运行的 Electron (yarn dev:debug)
//
// 用法：
//   node scripts/cdp-drive.mjs list
//   node scripts/cdp-drive.mjs eval "<url-substring>" "<jsExpression>"
//   node scripts/cdp-drive.mjs click "<url-substring>" "<selector>"
//   node scripts/cdp-drive.mjs snapshot "<url-substring>"          # 输出 ARIA 快照
//   node scripts/cdp-drive.mjs screenshot "<url-substring>" [path] # 默认存到 scripts/.cdp-shot.png
//   node scripts/cdp-drive.mjs url "<url-substring>"               # 仅打印 URL 与 title
//
// 说明：<url-substring> 用来在所有 page 里匹配（包含子串即可）。
//       例如 "#/home" 可匹配主页路由；不传或传 "" 时取第一个非 DevTools 的 page。

import { chromium } from 'playwright'

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222'

// 选择目标 page：按 URL 子串匹配，跳过 devtools://
function pickPage(pages, urlSubstring) {
  const candidates = pages.filter((p) => !p.url().startsWith('devtools://'))
  if (!urlSubstring) return candidates[0]
  return candidates.find((p) => p.url().includes(urlSubstring))
}

async function withPage(urlSubstring, fn) {
  const browser = await chromium.connectOverCDP(CDP_URL)
  try {
    const allPages = browser.contexts().flatMap((c) => c.pages())
    const page = pickPage(allPages, urlSubstring)
    if (!page) {
      const list = allPages.map((p) => p.url()).join('\n  ')
      throw new Error(`未找到匹配 "${urlSubstring}" 的 page。当前 pages:\n  ${list}`)
    }
    return await fn(page)
  } finally {
    // 注意：close 只是断开 CDP 连接，不会关闭 Electron 进程
    await browser.close()
  }
}

const [, , cmd, arg1, arg2] = process.argv

async function main() {
  switch (cmd) {
    case 'list': {
      const browser = await chromium.connectOverCDP(CDP_URL)
      const pages = browser.contexts().flatMap((c) => c.pages())
      const rows = await Promise.all(
        pages.map(async (p) => ({ url: p.url(), title: await p.title().catch(() => '') }))
      )
      console.log(JSON.stringify(rows, null, 2))
      await browser.close()
      return
    }
    case 'url': {
      await withPage(arg1, async (page) => {
        console.log(JSON.stringify({ url: page.url(), title: await page.title() }, null, 2))
      })
      return
    }
    case 'eval': {
      // 在目标 page 上下文里求值。表达式可以是任意 JS：表达式或 async IIFE。
      await withPage(arg1, async (page) => {
        const result = await page.evaluate(
          // 用 Function 构造，支持表达式或语句块
          // eslint-disable-next-line no-new-func
          new Function(`return (async () => { return (${arg2}); })()`)
        )
        console.log(JSON.stringify(result, null, 2))
      })
      return
    }
    case 'click': {
      await withPage(arg1, async (page) => {
        await page.click(arg2)
        console.log(`clicked: ${arg2}`)
      })
      return
    }
    case 'snapshot': {
      await withPage(arg1, async (page) => {
        const ariaSnapshot = await page.locator('body').ariaSnapshot()
        console.log(ariaSnapshot)
      })
      return
    }
    case 'screenshot': {
      const out = arg2 || 'scripts/.cdp-shot.png'
      await withPage(arg1, async (page) => {
        await page.screenshot({ path: out, fullPage: false })
        console.log(`saved: ${out}`)
      })
      return
    }
    default:
      console.error(
        'Usage: node scripts/cdp-drive.mjs <list|url|eval|click|snapshot|screenshot> [args...]'
      )
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err))
  process.exit(1)
})
