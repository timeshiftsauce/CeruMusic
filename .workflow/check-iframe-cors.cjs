/**
 * 内嵌 iframe 跨域放宽的端到端验证
 *
 * 复现链:window 里的 `<iframe sandbox="allow-scripts" src="https://shiqianjiang.cn/">`
 * —— 沙箱帧没有 allow-same-origin,文档拿到的是 opaque origin(null),
 * 于是它自己页面里的 `<script type="module" crossorigin src="/assets/index-*.js">`
 * 被当成跨域请求:目标站点不回 Access-Control-Allow-Origin 就被拦。
 *
 * 用法:
 *   node_modules/.bin/electron .workflow/check-iframe-cors.cjs           # 复现(预期看到 CORS 报错)
 *   node_modules/.bin/electron .workflow/check-iframe-cors.cjs --patch   # 打补丁后(预期 0 报错)
 *
 * 退出码:0 = 断言通过,1 = 断言失败,2 = 目标站点不可达(结论无效)
 */
const { app, BrowserWindow, session } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')

const TARGET = 'https://shiqianjiang.cn/'
const PATCH = process.argv.includes('--patch')
const ALLOW_SAME_ORIGIN = process.argv.includes('--allow-same-origin')
const PARENT = (process.argv.find((a) => a.startsWith('--parent=')) || '--parent=data').split('=')[1]
const SANDBOX = ALLOW_SAME_ORIGIN ? 'allow-scripts allow-same-origin' : 'allow-scripts'
const OBSERVE_MS = 9000
const HTTP_PORT = 41999

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<iframe id="f" src="${TARGET}" sandbox="${SANDBOX}" style="width:640px;height:420px"></iframe>
</body></html>`

/** 父页面来源矩阵:data( opaque) / file(应用打包后的真实情况) / http(开发态) */
function startParentServer() {
  if (PARENT !== 'http') return undefined
  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(PAGE)
  })
  server.listen(HTTP_PORT, '127.0.0.1')
  return server
}

function parentUrl() {
  if (PARENT === 'file') {
    const file = path.join(os.tmpdir(), 'ceru-iframe-cors-parent.html')
    fs.writeFileSync(file, PAGE)
    return 'file:///' + file.replace(/\\/g, '/')
  }
  if (PARENT === 'http') return `http://127.0.0.1:${HTTP_PORT}/`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(PAGE)
}

/** 目标站点的 .js 请求 —— 记录 CORS 头或网络错误,用来判断链路是否真的走到 */
function observeTargetScripts(activity) {
  const isTargetScript = (url) => url.startsWith(TARGET) && /\.js(\?|$)/.test(url)
  session.defaultSession.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
    if (!isTargetScript(details.url)) return
    const headers = details.responseHeaders || {}
    const key = Object.keys(headers).find((k) => k.toLowerCase() === 'access-control-allow-origin')
    activity.push({ url: details.url, acao: key ? headers[key].join(',') : null })
  })
  session.defaultSession.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, (details) => {
    if (isTargetScript(details.url)) activity.push({ url: details.url, error: details.error })
  })
}

app.whenReady().then(async () => {
  if (PATCH) {
    // 用被校验的真实实现(esbuild 转出来的 CJS),缺产物时给出构建命令
    try {
      require('./tmp/iframeEmbed.cjs').allowCrossOriginEmbeds()
    } catch {
      console.log(
        '缺少 tmp/iframeEmbed.cjs,先跑:\n' +
          '  node_modules/.bin/esbuild src/main/services/iframeEmbed.ts --bundle --format=cjs --platform=node --external:electron --outfile=.workflow/tmp/iframeEmbed.cjs'
      )
      return app.exit(2)
    }
  }

  const activity = []
  observeTargetScripts(activity)

  const server = startParentServer()
  const logs = []
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      // 与主窗口一致(CeruMusic/src/main/index.ts)
      sandbox: false,
      webSecurity: false,
      contextIsolation: false,
      nodeIntegration: true
    }
  })
  // Electron 44 的 console-message 第二参可能是 details 对象
  win.webContents.on('console-message', (...args) => {
    const arg = args[1]
    logs.push(String(arg && typeof arg === 'object' ? arg.message : args[2]))
  })

  await win.loadURL(parentUrl())
  await wait(OBSERVE_MS)
  server?.close()

  const corsErrors = logs.filter((m) => /CORS policy|Access to script/i.test(m))
  const storageErrors = logs.filter((m) => /SecurityError|localStorage|cookie/i.test(m))
  const withAcao = activity.filter((item) => item.acao)
  console.log(
    JSON.stringify(
      {
        patch: PATCH,
        sandbox: SANDBOX,
        parent: PARENT,
        activity: activity.slice(0, 3),
        corsErrors,
        storageErrors,
        logs: logs.slice(0, 6)
      },
      null,
      2
    )
  )

  if (activity.length === 0) {
    console.log('RESULT: 目标站点不可达,本次结论无效')
    return app.exit(2)
  }

  if (ALLOW_SAME_ORIGIN) {
    // NoticeCard 新方案:不靠主进程补头,纯靠 allow-same-origin 回到真实 origin
    const ok = corsErrors.length === 0 && storageErrors.length === 0
    console.log(ok ? 'RESULT: PASS —— 跨域与存储都正常' : 'RESULT: FAIL —— 仍有报错')
    return app.exit(ok ? 0 : 1)
  }

  if (PATCH) {
    const ok = corsErrors.length === 0 && withAcao.length > 0
    console.log(ok ? 'RESULT: PASS —— 跨域脚本已放行' : 'RESULT: FAIL —— 仍然被拦')
    return app.exit(ok ? 0 : 1)
  }

  const reproduced = corsErrors.length > 0
  console.log(reproduced ? 'RESULT: REPRODUCED —— 未打补丁时确实被 CORS 拦' : 'RESULT: NOT REPRODUCED')
  return app.exit(reproduced ? 0 : 1)
})
