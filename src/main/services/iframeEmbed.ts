/**
 * 让内嵌的跨域 iframe 能正常加载资源(Electron 侧强制放宽响应头)
 *
 * 背景:
 *  应用里两处 iframe —— 通知卡片的网页嵌入(NoticeCard.vue)与插件网页面
 *  (PluginWebSurface.vue)都带 sandbox 且没有 allow-same-origin,文档是 opaque
 *  origin(null)。Chromium 会把这类文档发起的 `<script type="module" crossorigin>`、
 *  fetch、@font-face 请求全按跨域处理:目标站点不回 Access-Control-Allow-Origin
 *  就直接拦截(控制台即 "from origin 'null' has been blocked by CORS policy")。
 *  webPreferences.webSecurity=false 只关掉本 webContents 的普通同源策略,
 *  管不到 sandbox 子框架里这些请求。
 *
 *  另一半问题:不少站点用 X-Frame-Options / CSP frame-ancestors 禁止被嵌入,
 *  不摘掉这两个头,iframe 直接白屏。
 *
 * 做法(全部在会话层兜底,不动业务代码):
 *  1. onHeadersReceived 时,只给**缺失** CORS 头的响应补 Access-Control-Allow-Origin: *;
 *     已经自带 ACAO 的响应原样保留 —— 带 credentials 的接口(澜音自己的 API)不会被 "*" 破坏。
 *  2. OPTIONS 预检响应缺头时顺带补 Allow-Methods / Allow-Headers,否则需要预检的
 *     POST/PUT 一样会被拦。
 *  3. 删掉 X-Frame-Options,并把 CSP 里的 frame-ancestors 指令摘掉(其余指令不动)。
 *
 * 注意:一个 session 只能挂一个 onHeadersReceived 监听器,
 * 以后若别处也要看响应头,请合并到这里,而不是各自再注册一次(后注册的会顶掉先注册的)。
 */
import { app, session } from 'electron'
import type { Session } from 'electron'

/** 已挂过监听的 session —— 避免重复 patch 把监听器顶掉 */
const patchedSessions = new WeakSet<Session>()

/** 大小写不敏感地找响应头键名 —— Chromium 回给我们的键名大小写不保证 */
function findHeaderKey(headers: Record<string, string[]>, name: string): string | undefined {
  const lower = name.toLowerCase()
  return Object.keys(headers).find((key) => key.toLowerCase() === lower)
}

/** 摘掉 CSP 里的 frame-ancestors 指令,其余指令原样保留 */
function stripFrameAncestors(policy: string): string {
  return policy
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive && !/^frame-ancestors\b/i.test(directive))
    .join('; ')
}

/** 按需放宽响应头 —— 返回给 Electron 的替换品 */
function relaxResponseHeaders(
  rawHeaders: Record<string, string[]> | undefined,
  method: string
): Record<string, string[]> {
  const headers = rawHeaders ?? {}

  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase()
    if (lower === 'x-frame-options') {
      // 站点的防嵌入声明,在内嵌场景下强制放开
      delete headers[key]
    } else if (
      lower === 'content-security-policy' ||
      lower === 'content-security-policy-report-only'
    ) {
      headers[key] = headers[key].map(stripFrameAncestors)
    }
  }

  if (!findHeaderKey(headers, 'Access-Control-Allow-Origin')) {
    headers['Access-Control-Allow-Origin'] = ['*']
  }

  if (method.toUpperCase() === 'OPTIONS') {
    if (!findHeaderKey(headers, 'Access-Control-Allow-Methods')) {
      headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS']
    }
    if (!findHeaderKey(headers, 'Access-Control-Allow-Headers')) {
      headers['Access-Control-Allow-Headers'] = ['*']
    }
  }

  return headers
}

function patchSession(target: Session): void {
  if (patchedSessions.has(target)) return
  patchedSessions.add(target)
  target.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
    callback({ responseHeaders: relaxResponseHeaders(details.responseHeaders, details.method) })
  })
}

/**
 * 在主进程启动时调用一次:
 *  默认 session + 之后新建的任意 session(插件窗口、worker 窗口)都会生效。
 */
export function allowCrossOriginEmbeds(): void {
  patchSession(session.defaultSession)
  app.on('session-created', (created) => patchSession(created))
}
