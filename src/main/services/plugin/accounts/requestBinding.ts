export interface CredentialBinding { origin: string; sendAs: 'bearer' | 'cookie' }
export function validateBinding(value:unknown): CredentialBinding | undefined {
  if (value === undefined) return undefined
  const binding = value as CredentialBinding
  if (!binding || !['bearer','cookie'].includes(binding.sendAs) || typeof binding.origin !== 'string') throw Error('账号请求绑定无效')
  const url = new URL(binding.origin)
  if (url.protocol !== 'https:' || url.origin !== binding.origin) throw Error('账号请求必须绑定完整 HTTPS 来源')
  return {origin:url.origin,sendAs:binding.sendAs}
}
export function credentialHeaders(binding:CredentialBinding, url:URL, headers:Record<string,string> | undefined, secret:string) {
  if (url.origin !== binding.origin || url.username || url.password) throw Error('账号凭据不能用于此地址')
  if (!secret || /[^\x20-\x7e]/.test(secret) || Object.keys(headers ?? {}).some(key=>/^(authorization|cookie)$/i.test(key))) throw Error('账号请求头无效或冲突')
  return { ...headers, ...(binding.sendAs === 'bearer' ? {Authorization:'Bearer '+secret} : {Cookie:secret}) }
}
