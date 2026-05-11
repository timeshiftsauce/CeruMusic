/**
 * API 资源常量 —— 从 config.json 派生,避免在多处硬编码 URL 字符串
 *
 * 设计:
 *  - `baseUrl` 列表里每条 { name, url, developmentUrl } 表示一个后端 resource。
 *    `url` 是生产地址,**同时也是 Logto access token 的 audience(aud)**,
 *    不论 dev/prod 都用同一个 token 所以这个值不能换。
 *  - dev 模式由 `utils/request.ts` 的 SocketRequest / Request 内部读取
 *    `developmentUrl` 自动切换 baseURL。
 *
 * 用法:
 *   import { CERU_API_RESOURCE } from '@common/api/resources'
 *   new Request(CERU_API_RESOURCE)
 *   new SocketRequest('/lt', CERU_API_RESOURCE)
 *
 * 新增后端:在 config.json 加一条,在此文件加一个 const 导出即可。
 */
import config from './config.json'

interface BackendEntry {
  name: string
  url: string
  developmentUrl?: string
}

const ENTRIES = ((config as { baseUrl?: BackendEntry[] }).baseUrl || []).reduce(
  (acc, e) => {
    acc[e.name] = e
    return acc
  },
  {} as Record<string, BackendEntry>
)

/** 取指定 name 的 resource(生产 URL,token aud) */
export function getResource(name: string): string {
  const entry = ENTRIES[name]
  if (!entry) {
    throw new Error(`[common/api] 未找到名为 "${name}" 的 baseUrl 配置,请检查 config.json`)
  }
  return entry.url
}

/* ---------------- 命名导出 —— 业务直接用这些 ---------------- */

/** CeruMusic 主后端(房间/分享/账户同步等都用它) */
export const CERU_API_RESOURCE = getResource('CeruMusic-Backend')
