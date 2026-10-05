import tls from 'node:tls'

/**
 * “信任系统证书”能力：让当前 Node 进程的 TLS 连接信任 Windows 系统证书库中的
 * 全部根证书（与浏览器行为一致），用于兼容 Reqable / Charles 等抓包工具或企业代理
 * 的 HTTPS 中间人证书。开启后仅影响此后新建的连接。
 *
 * 说明：本模块保持零运行时依赖（仅 node:tls），可安全地被 worker 线程引用；
 * 配置读写请使用 TRUST_SYSTEM_CA_KEY + ConfigManager 在各调用方完成。
 */
export const TRUST_SYSTEM_CA_KEY = 'trustSystemCertificates'

interface TlsCaApi {
  getCACertificates?: (type: 'default' | 'system' | 'bundled') => string[]
  setDefaultCACertificates?: (certs: readonly string[]) => void
}

/** 当前运行时（Node ≥ 22.15 / Electron 内置 Node 对应版本）是否支持读取系统证书库 */
export function isSystemCaTrustSupported(): boolean {
  const api = tls as unknown as TlsCaApi
  return (
    typeof api.getCACertificates === 'function' &&
    typeof api.setDefaultCACertificates === 'function'
  )
}

/**
 * 应用/撤销“信任系统证书”。
 * - enabled = true  → 默认 CA = 系统证书库 + Node 内置 CA
 * - enabled = false → 恢复为 Node 内置 CA
 * @returns 是否应用成功（运行时能力不支持时返回 false）
 */
export function applyTrustSystemCertificates(enabled: boolean): boolean {
  const api = tls as unknown as TlsCaApi
  if (!isSystemCaTrustSupported()) return false
  try {
    const defaults = api.getCACertificates!('default') ?? []
    const merged = enabled
      ? [...new Set([...(api.getCACertificates!('system') ?? []), ...defaults])]
      : [...defaults]
    api.setDefaultCACertificates!(merged)
    return true
  } catch (error) {
    console.warn('[system-ca] 应用系统证书信任失败:', error)
    return false
  }
}
