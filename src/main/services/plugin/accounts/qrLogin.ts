import { setTimeout as delay } from 'node:timers/promises'
import type { AccountLoginResult } from '@shiqianjiang/ceru-plugin-sdk'
import { validateBinding } from './requestBinding'

export function checkQrImage(value: unknown): string {
  const prefix = 'data:image/png;base64,'
  if (typeof value !== 'string' || value.length > 350000 || !value.startsWith(prefix)) throw Error('二维码必须是 PNG 数据图片')
  const text = value.slice(prefix.length)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw Error('二维码图片无效')
  const bytes = Buffer.from(text,'base64')
  if (bytes.length < 33 || bytes.toString('base64') !== text || bytes.readBigUInt64BE(0) !== 0x89504e470d0a1a0an || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii',12,16) !== 'IHDR') throw Error('二维码 PNG 无效')
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (!width || !height || width > 1024 || height > 1024) throw Error('二维码尺寸无效')
  return value
}
export function qrPresentation(image: unknown, url: unknown) {
  if (url === undefined) return {image:checkQrImage(image)}
  // eslint-disable-next-line no-control-regex -- Reject raw controls before URL normalization can remove them.
  if (image !== undefined || typeof url !== 'string' || !/^https:\/\//i.test(url) || /[\s\\\u0000-\u001f\u007f]/.test(url)) throw Error('扫码登录需要 HTTPS 地址或 PNG 图片，不能同时提供')
  const target = new URL(url)
  if (target.username || target.password || Buffer.byteLength(target.href) > 1500) throw Error('扫码登录地址无效')
  return {url:target.href,origin:target.origin}
}
export async function pollQrLogin(expiresInMs: number, session: AbortSignal,
  poll: (signal: AbortSignal)=>Promise<any>, update: (status:'waiting'|'scanned')=>Promise<boolean>): Promise<AccountLoginResult | {expired:true} | null> {
  if (!Number.isSafeInteger(expiresInMs) || expiresInMs < 1000 || expiresInMs > 300000) throw Error('二维码有效期无效')
  const expiry = AbortSignal.timeout(expiresInMs), signal = AbortSignal.any([session,expiry])
  let scanned = false
  try {
    while (!signal.aborted) {
      const result = await poll(signal)
      signal.throwIfAborted()
      if (!result || !['waiting','scanned','expired','done'].includes(result.status)) throw Error('扫码状态无效')
      if (result.status === 'expired') return {expired:true}
      if (result.status === 'scanned') scanned = true
      if (!await update(scanned ? 'scanned' : 'waiting')) return null
      signal.throwIfAborted()
      if (result.status === 'done') {
        if (typeof result.credential !== 'string' || !result.credential || Buffer.byteLength(result.credential)>65536) throw Error('扫码登录结果无效')
        const binding = validateBinding(result.binding)
        return {credential:result.credential,...(binding ? {binding} : {})}
      }
      await delay(1000,undefined,{signal})
    }
  } catch (error) { if (!signal.aborted) throw error }
  session.throwIfAborted()
  return {expired:true}
}
