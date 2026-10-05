import { app, session, type ProxyConfig } from 'electron'
import { configManager } from './ConfigManager'
import { setRequestAgentProvider } from '../utils/request'
import {
  createProxyAgentPair,
  isLocalOrPrivateHostname,
  type ProxyAgentPair,
  type ProxyRule
} from '../utils/proxyAgents'

/**
 * 网络代理模式
 * - direct: 直连,不使用代理(默认,避免系统代理导致音频/封面加载失败)
 * - system: 跟随系统代理(Chromium 默认行为)
 * - custom: 自定义 HTTP / SOCKS5 代理
 */
export type NetworkProxyMode = 'direct' | 'system' | 'custom'
export type NetworkProxyProtocol = 'http' | 'socks5'

export interface NetworkProxyConfig {
  mode: NetworkProxyMode
  protocol: NetworkProxyProtocol
  host: string
  port: string
  username: string
  password: string
}

export interface NetworkProxyTestResult {
  ok: boolean
  message: string
  elapsedMs?: number
}

export const DEFAULT_NETWORK_PROXY_CONFIG: NetworkProxyConfig = {
  mode: 'direct',
  protocol: 'http',
  host: '',
  port: '',
  username: '',
  password: ''
}

const CONFIG_KEY = 'networkProxy'
// 内存会话:测试代理时不污染默认会话,也不落盘
const TEST_PARTITION = 'ceru-network-proxy-test'
const TEST_URLS = ['https://www.baidu.com/', 'https://music.163.com/']

let currentConfig: NetworkProxyConfig = { ...DEFAULT_NETWORK_PROXY_CONFIG }
// 连通性测试期间的临时认证凭据(优先于已保存的配置)
let pendingTestAuth: NetworkProxyConfig | null = null

// Node 侧(axios / 插件运行时)当前生效的代理规则与缓存的 agents
let currentNodeRule: ProxyRule | null = null
let cachedAgentPair: ProxyAgentPair | null = null
let cachedAgentPairKey = ''

function releaseAgentPair(): void {
  if (!cachedAgentPair) return
  try {
    cachedAgentPair.httpAgent?.destroy?.()
  } catch {}
  if (cachedAgentPair.httpsAgent !== cachedAgentPair.httpAgent) {
    try {
      cachedAgentPair.httpsAgent?.destroy?.()
    } catch {}
  }
  cachedAgentPair = null
  cachedAgentPairKey = ''
}

function ensureAgentPair(rule: ProxyRule): ProxyAgentPair {
  const key = `${rule.protocol}//${rule.username ?? ''}@${rule.host}:${rule.port}`
  if (cachedAgentPair && cachedAgentPairKey === key) return cachedAgentPair
  releaseAgentPair()
  cachedAgentPair = createProxyAgentPair(rule)
  cachedAgentPairKey = key
  return cachedAgentPair
}

/**
 * 给具体请求取代理 agents:直连模式或本地/私网目标返回 null(直连)。
 * 供主进程请求工具、音频缓存、下载器与插件运行时(core)共用。
 */
export function getRequestAgentsFor(url?: string): ProxyAgentPair | null {
  if (!currentNodeRule) return null
  if (url) {
    try {
      if (isLocalOrPrivateHostname(new URL(url).hostname)) return null
    } catch {
      return null
    }
  }
  return ensureAgentPair(currentNodeRule)
}

/** 当前 Node 侧代理规则(可结构化克隆,供下载 worker 使用) */
export function getCurrentProxyRule(): ProxyRule | null {
  return currentNodeRule ? { ...currentNodeRule } : null
}

/** 解析系统代理(Chromium 视角)并转成 Node 侧规则;直连/解析失败返回 null */
async function resolveSystemProxyRule(): Promise<ProxyRule | null> {
  try {
    // 用独立的一次性 session 读取系统代理判定：resolveProxy 反映“当前会话”的
    // 最终判决，若复用 defaultSession，第二次应用时会读到我们上次设置的
    // fixed_servers（自反馈），导致系统代理变更无法被感知。
    const probeSession = session.fromPartition('ceru-system-proxy-probe')
    const resolved = await probeSession.resolveProxy(TEST_URLS[0])
    for (const entry of String(resolved || '').split(';')) {
      const value = entry.trim()
      let match = /^PROXY\s+(.+):(\d+)$/i.exec(value)
      if (match) return { protocol: 'http', host: match[1], port: Number(match[2]) }
      match = /^SOCKS5?\s+(.+):(\d+)$/i.exec(value)
      if (match) return { protocol: 'socks5', host: match[1], port: Number(match[2]) }
    }
  } catch {}
  return null
}

/** 按当前设置刷新 Node 侧代理规则并重建 agents 缓存 */
async function refreshNodeRule(cfg: NetworkProxyConfig): Promise<void> {
  let rule: ProxyRule | null = null
  if (cfg.mode === 'custom') {
    rule = {
      protocol: cfg.protocol === 'socks5' ? 'socks5' : 'http',
      host: cfg.host,
      port: Number(cfg.port),
      username: cfg.username || undefined,
      password: cfg.password || undefined
    }
  } else if (cfg.mode === 'system') {
    rule = await resolveSystemProxyRule()
  }
  currentNodeRule = rule
  if (rule) {
    ensureAgentPair(rule)
  } else {
    releaseAgentPair()
  }
}

export function getNetworkProxyConfig(): NetworkProxyConfig {
  return { ...currentConfig }
}

export function normalizeNetworkProxyConfig(
  input?: Partial<NetworkProxyConfig> | null
): NetworkProxyConfig {
  const source = input ?? {}
  const cfg: NetworkProxyConfig = {
    mode: source.mode === 'system' || source.mode === 'custom' ? source.mode : 'direct',
    protocol: source.protocol === 'socks5' ? 'socks5' : 'http',
    host: String(source.host ?? '').trim(),
    port: String(source.port ?? '').trim(),
    username: String(source.username ?? ''),
    password: String(source.password ?? '')
  }
  if (cfg.mode === 'custom') {
    const port = Number(cfg.port)
    if (!cfg.host) throw new Error('请填写代理地址')
    if (/\s/.test(cfg.host)) throw new Error('代理地址不能包含空格')
    if (!/^\d+$/.test(cfg.port) || port <= 0 || port > 65535) throw new Error('代理端口无效')
  }
  return cfg
}

/**
 * 生成 Chromium 会话代理配置。
 *
 * 注意：'system' 不能直接用 `{ mode: 'system' }` —— 当系统代理带有 `<-loopback>`
 * （抓包工具如 Reqable / Charles 用它强制 loopback 流量也走代理）时，应用自身的
 * 本地请求（例如开发服务器 localhost:5173）也会被送进上游代理，导致
 * ERR_EMPTY_RESPONSE 之类的加载失败。这里改为“解析系统代理 + 显式本地绕过”的
 * fixed_servers 配置，保证 loopback / 无点主机名始终直连。
 */
async function toSessionProxyConfig(cfg: NetworkProxyConfig): Promise<ProxyConfig> {
  if (cfg.mode === 'system') {
    const rule = await resolveSystemProxyRule()
    if (!rule) return { mode: 'direct' }
    const scheme = rule.protocol === 'socks5' ? 'socks5' : 'http'
    return {
      mode: 'fixed_servers',
      proxyRules: `${scheme}://${rule.host}:${rule.port}`,
      proxyBypassRules: '<local>'
    }
  }
  if (cfg.mode === 'custom') {
    const rules = `${cfg.protocol === 'socks5' ? 'socks5' : 'http'}://${cfg.host}:${cfg.port}`
    return { mode: 'fixed_servers', proxyRules: rules, proxyBypassRules: '<local>' }
  }
  return { mode: 'direct' }
}

/**
 * 应用(并可选持久化)网络代理配置。立即对新建立的连接生效。
 */
export async function applyNetworkProxyConfig(
  input?: Partial<NetworkProxyConfig> | null,
  persist = false
): Promise<NetworkProxyConfig> {
  const cfg = normalizeNetworkProxyConfig(input)
  currentConfig = cfg
  await session.defaultSession.setProxy(await toSessionProxyConfig(cfg))
  await refreshNodeRule(cfg)
  if (persist) configManager.set(CONFIG_KEY, cfg)
  return cfg
}

/**
 * 启动时调用:读取已保存的代理配置并应用。
 * 未配置过时默认「直连」—— 显式覆盖 Chromium 默认的「跟随系统代理」,
 * 避免系统代理(如各类加速器)导致音频流、封面图片等请求偶发失败。
 */
export async function initNetworkProxyConfig(): Promise<void> {
  const saved = configManager.get<Partial<NetworkProxyConfig> | null>(CONFIG_KEY, null)
  try {
    const cfg = await applyNetworkProxyConfig(saved ?? DEFAULT_NETWORK_PROXY_CONFIG)
    console.log(`[network] 网络代理模式: ${cfg.mode}`)
  } catch (error) {
    console.warn('[network] 代理设置无效,已回退为直连:', error)
    await applyNetworkProxyConfig(DEFAULT_NETWORK_PROXY_CONFIG)
  }
}

/**
 * 注册代理认证应答:自定义代理配置了用户名/密码时,Chromium 会触发 login 事件。
 * 测试期间优先使用待测配置的凭据。
 */
export function registerProxyAuthentication(): void {
  app.on('login', (event, _webContents, _details, authInfo, callback) => {
    if (!authInfo?.isProxy) return
    const credential =
      pendingTestAuth ??
      (currentConfig.mode === 'custom' && currentConfig.username ? currentConfig : null)
    if (!credential?.username) return
    event.preventDefault()
    callback(credential.username, credential.password)
  })
}

/**
 * 使用待保存的配置做一次连通性测试(不影响当前生效的设置)。
 */
export async function testNetworkProxy(
  input?: Partial<NetworkProxyConfig> | null
): Promise<NetworkProxyTestResult> {
  let cfg: NetworkProxyConfig
  try {
    cfg = normalizeNetworkProxyConfig(input)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  const testSession = session.fromPartition(TEST_PARTITION)
  try {
    await testSession.setProxy(await toSessionProxyConfig(cfg))
  } catch (error) {
    return {
      ok: false,
      message: `代理配置无效:${error instanceof Error ? error.message : String(error)}`
    }
  }
  pendingTestAuth = cfg.mode === 'custom' && cfg.username ? cfg : null
  let lastError = ''
  try {
    for (const url of TEST_URLS) {
      const started = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      try {
        const response = await testSession.fetch(url, { method: 'GET', signal: controller.signal })
        // 407: 代理认证失败;5xx: 代理/网关异常 —— 均视为失败
        if (response.status < 500 && response.status !== 407) {
          return {
            ok: true,
            message: `连接成功(${new URL(url).host})`,
            elapsedMs: Date.now() - started
          }
        }
        lastError = response.status === 407 ? '代理认证失败(HTTP 407)' : `HTTP ${response.status}`
      } catch (error: any) {
        lastError = error?.message || String(error)
      } finally {
        clearTimeout(timer)
      }
    }
  } finally {
    pendingTestAuth = null
  }
  return { ok: false, message: `连接失败:${lastError || '未知错误'}` }
}

// ---- 向各请求方注册代理解析器(统一读取本模块的当前规则状态) ----

// 主进程请求工具(request.js 的 httpFetch:本地音乐封面等)
setRequestAgentProvider((url) => getRequestAgentsFor(url))

// 插件运行时(core 的 requestNetwork:搜索/歌词/解析 URL 等均经此)。
// 用动态导入,避免 node_modules 尚未更新到带注入点的版本时整体加载失败。
void import('@shiqianjiang/ceru-plugin-core/network')
  .then((core) => {
    core.setNetworkProxyResolver?.((url) => getRequestAgentsFor(url))
  })
  .catch((error) => {
    console.warn('[network] 插件网络代理解析器注册失败:', error)
  })
