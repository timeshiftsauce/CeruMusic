import { createHash } from 'node:crypto'
import { canonical, encodePermissionKeys } from '../shared/permissions'
import { getPluginPermissions, savePluginPermissions } from '../pluginConfig'
import { callPluginUI } from '../uiBridge'

type Manifest = {
  manifestVersion?: number
  name: string
  version: string
  publisher?: string
  uses?: {
    permissions?: { key: string; name: string; reason?: string; optional?: boolean; scope?: any }[]
  }
  entry?: {
    server?: { runtime: string; lan?: boolean }
    native?: { name: string; platforms: Record<string, string> }[]
  }
}
type VerifiedArtifact = {
  header: { manifest: Manifest; signature: { publicKey: string } | null }
  signatureStatus: string
}
const legacyPrefix = 'trusted-consent:v1:'
const prefix = 'trusted-consent:v2:utility-unrestricted:'
const restrictedPrefix = prefix + 'restricted:'
const stoppers = new Map<string, () => Promise<void>>()

/** Call only with the artifact returned by the core's signature-verifying reader. */
export function trustedPublisher(artifact: VerifiedArtifact, development = false): string | null {
  if (development) return 'development:' + (artifact.header.manifest.publisher ?? '')
  if (
    !['verified-trusted', 'verified-untrusted'].includes(artifact.signatureStatus) ||
    !artifact.header.signature
  )
    return null
  return canonical({
    publisher: artifact.header.manifest.publisher ?? '',
    key: createHash('sha256').update(artifact.header.signature.publicKey).digest('hex')
  })
}

export function trustedDeclaration(manifest: Manifest) {
  const declarations = manifest.uses?.permissions?.filter((p) => p.name === 'runtime.trusted') ?? []
  const requires = manifest.entry?.server?.runtime === 'node' || !!manifest.entry?.native?.length
  if (declarations.length > 1 || (requires && declarations.length !== 1))
    throw Error('完整 Node 环境或原生模块必须声明唯一的 runtime.trusted 权限')
  const declaration = declarations[0]
  if (
    declaration &&
    (typeof declaration.reason !== 'string' ||
      declaration.reason.trim().length < 10 ||
      declaration.reason.length > 300 ||
      /<\/?[a-z][^>]*>/i.test(declaration.reason))
  )
    throw Error('完全信任的开发者说明必须为 10 到 300 个字符的纯文本')
  return declaration
}

function record(manifest: Manifest, publisher: string) {
  const declaration = trustedDeclaration(manifest)
  return (
    declaration &&
    prefix +
      canonical({
        permission: encodePermissionKeys([declaration as any], [declaration.key])[0],
        publisher
      })
  )
}

/** Fails closed for missing signatures, changed publishers and changed permission scopes. */
export function readTrustedConsent(
  owner: string,
  manifest: Manifest,
  publisher: string | null
): boolean {
  if (!publisher) return false
  try {
    const expected = record(manifest, publisher)
    return !!expected && getPluginPermissions(owner).includes(expected)
  } catch {
    return false
  }
}

export function trustedConsentRecords(owner: string): string[] {
  return getPluginPermissions(owner).filter((value) => value.startsWith(prefix) || value.startsWith(legacyPrefix))
}

export function writeTrustedConsent(
  owner: string,
  manifest: Manifest,
  publisher: string | null,
  allowed: boolean
) {
  const records = getPluginPermissions(owner).filter((value) => !value.startsWith(prefix) && !value.startsWith(legacyPrefix))
  if (allowed) {
    if (!publisher) throw Error('完全信任插件必须具有有效签名')
    const value = record(manifest, publisher)
    if (!value) throw Error('插件未声明完全信任权限')
    records.push(value)
  } else if (publisher && trustedDeclaration(manifest)) {
    records.push(restrictedPrefix + record(manifest, publisher)!.slice(prefix.length))
  }
  savePluginPermissions(owner, records)
}

/** Parent runtime registers its immediate trusted-process shutdown here. */
export function registerTrustedRuntimeStopper(
  owner: string,
  stop: () => Promise<void>
): () => void {
  stoppers.set(owner, stop)
  return () => {
    if (stoppers.get(owner) === stop) stoppers.delete(owner)
  }
}
export async function stopTrustedRuntime(owner: string): Promise<boolean> {
  const stop = stoppers.get(owner)
  if (!stop) return false
  await stop()
  return true
}

export function trustedConsentDetail(
  owner: string,
  manifest: Manifest,
  publisher: string | null,
  development = false
) {
  const declaration = trustedDeclaration(manifest)
  if (!declaration) return null
  return {
    pluginName: manifest.name,
    version: manifest.version,
    publisher: manifest.publisher || '未提供发布者名称',
    publisherIdentity: publisher,
    signature: development
      ? '开发中，未签名'
      : publisher
        ? '签名已验证'
        : '未签名，无法开启完全信任',
    optional: declaration.optional === true,
    reason: declaration.reason,
    granted: readTrustedConsent(owner, manifest, publisher),
    warning: [
      '在独立进程中运行完整的 Node 环境',
      '可以直接访问网络，澜音无法检查它访问了哪里',
      '可以访问你电脑上的所有文件，也可以启动其他程序',
      ...(manifest.entry?.native ?? []).map(
        (module) => `将运行原生模块 ${module.name}（${Object.keys(module.platforms).join('、')}）`
      ),
      ...(manifest.entry?.server?.lan ? ['局域网内的设备可以访问此插件的服务'] : []),
      '澜音无法限制它的行为，只在你信任开发者时安装'
    ],
    otherPermissions: (manifest.uses?.permissions ?? [])
      .filter((p) => p.name !== 'runtime.trusted')
      .map((p) => p.name)
  }
}

/** Ask before creating any worker, lifecycle host, or trusted process. Does not persist. */
export async function requestTrustedConsent(
  owner: string,
  manifest: Manifest,
  publisher: string | null,
  development = false,
  force = false
) {
  const detail = trustedConsentDetail(owner, manifest, publisher, development)
  if (!detail) return undefined
  if (!publisher) throw Error('完全信任插件必须具有有效签名（开发者模式除外）')
  if (detail.granted) return true
  if (
    !force &&
    detail.optional &&
    getPluginPermissions(owner).includes(
      restrictedPrefix + record(manifest, publisher)!.slice(prefix.length)
    )
  )
    return false
  const answer = await callPluginUI(owner, 'host.trustedConsent', detail)
  if (answer?.choice === 'grant' && answer.acknowledged === true) return true
  if (answer?.choice === 'restricted' && detail.optional) return false
  throw Error('已取消完全信任插件的安装或授权')
}
