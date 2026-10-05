import { isIP } from 'node:net'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'
import { SocksProxyAgent } from 'socks-proxy-agent'

/** 一条上游代理规则(由 networkProxy 服务按设置解析得到) */
export interface ProxyRule {
  protocol: 'http' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

export interface ProxyAgentPair {
  httpAgent: any
  httpsAgent: any
}

/**
 * 本地/私网地址判断(与 @shiqianjiang/ceru-plugin-core 的 isPrivateAddress 保持一致):
 * 这类目标永远直连,避免把 DLNA / 本地服务 / 局域网插件请求发给上游代理。
 */
export function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase()
  if (value.startsWith('::ffff:')) {
    const tail = value.slice(7)
    if (tail.includes('.')) return isPrivateAddress(tail)
    const words = tail.split(':').map((part) => parseInt(part, 16))
    return isPrivateAddress(
      [words[0] >> 8, words[0] & 255, words[1] >> 8, words[1] & 255].join('.')
    )
  }
  if (value.includes(':')) return !/^[23][0-9a-f]{3}:/.test(value)
  const [a, b] = value.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/** 主机名是否指向本机/局域网(IP 字面量与 localhost 系) */
export function isLocalOrPrivateHostname(hostname: string): boolean {
  const host = (hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (isIP(host)) return isPrivateAddress(host)
  return false
}

export function proxyRuleToUrl(rule: ProxyRule): string {
  const auth = rule.username
    ? `${encodeURIComponent(rule.username)}:${encodeURIComponent(rule.password ?? '')}@`
    : ''
  return `${rule.protocol === 'socks5' ? 'socks5h' : 'http'}://${auth}${rule.host}:${rule.port}`
}

/**
 * 根据代理规则创建一对 agent(HTTP 目标用 httpAgent,HTTPS 目标用 httpsAgent)。
 * SOCKS5 使用 socks5h(域名交给代理解析),同一实例可同时服务 http/https。
 */
export function createProxyAgentPair(rule: ProxyRule): ProxyAgentPair {
  const url = proxyRuleToUrl(rule)
  if (rule.protocol === 'socks5') {
    const agent = new SocksProxyAgent(url)
    return { httpAgent: agent, httpsAgent: agent }
  }
  const options = { proxy: url, keepAlive: true, keepAliveMsecs: 30000 }
  return {
    httpAgent: new HttpProxyAgent(options),
    httpsAgent: new HttpsProxyAgent(options)
  }
}
