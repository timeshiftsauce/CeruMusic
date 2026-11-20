import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { safeStorage } from 'electron'
import type { CredentialRef } from '@shiqianjiang/ceru-plugin-sdk'
import { getAppDirPath } from '../../../utils/path'

type Cipher = Pick<typeof safeStorage, 'isAsyncEncryptionAvailable' | 'getSelectedStorageBackend' | 'encryptStringAsync' | 'decryptStringAsync'>
export interface AccountOwner { pluginId: string; accountId: string }
const validRef = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export class AccountVault {
  constructor(private root: () => string, private cipher: Cipher, private platform = process.platform) {}

  private directory(pluginId: string) {
    if (!pluginId || pluginId.length > 256) throw Error('无效的插件实例')
    return join(this.root(), createHash('sha256').update(pluginId).digest('hex'))
  }

  accountDirectory(owner: AccountOwner) {
    if (!owner.accountId || owner.accountId.length > 256) throw Error('无效的账号标识')
    return join(this.directory(owner.pluginId), createHash('sha256').update(owner.accountId).digest('hex'))
  }

  private file(owner: AccountOwner, ref: CredentialRef) {
    if (!owner.accountId || owner.accountId.length > 256 || ref.kind !== 'credential' || !validRef.test(ref.id)) throw Error('无效的账号凭据引用')
    return join(this.accountDirectory(owner), ref.id + '.bin')
  }

  private async requireEncryption() {
    if (!(await this.cipher.isAsyncEncryptionAvailable()) ||
      (this.platform === 'linux' && !['gnome_libsecret','kwallet','kwallet5','kwallet6'].includes(this.cipher.getSelectedStorageBackend()))) {
      throw Error('系统安全存储不可用，未保存或读取账号凭据')
    }
  }

  async create(owner: AccountOwner, secret: string): Promise<CredentialRef> {
    if (typeof secret !== 'string' || !secret || Buffer.byteLength(secret) > 65536) throw Error('账号凭据无效')
    const ref: CredentialRef = { kind: 'credential', id: randomUUID() }
    const file = this.file(owner, ref)
    await this.requireEncryption()
    const encrypted = await this.cipher.encryptStringAsync(JSON.stringify({ version: 1, pluginId: owner.pluginId, accountId: owner.accountId, id: ref.id, secret }))
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    const temporary = file + '.tmp'
    try {
      await writeFile(temporary, encrypted, { flag: 'wx', mode: 0o600 })
      await rename(temporary, file)
    } finally { await rm(temporary, { force: true }) }
    return ref
  }

  async read(owner: AccountOwner, ref: CredentialRef): Promise<string> {
    const file = this.file(owner, ref)
    await this.requireEncryption()
    try {
      const { result } = await this.cipher.decryptStringAsync(await readFile(file))
      const value = JSON.parse(result)
      if (value.version === 1 && value.pluginId === owner.pluginId && value.accountId === owner.accountId && value.id === ref.id && typeof value.secret === 'string') return value.secret
    } catch { /* Do not include a sensitive path or decryption error in the public message. */ }
    throw Error('账号凭据不可用')
  }

  async forget(owner: AccountOwner, ref: CredentialRef) { await rm(this.file(owner, ref), { force: true }) }
  async forgetPlugin(pluginId: string) { await rm(this.directory(pluginId), { recursive: true, force: true }) }
}

export const pluginAccountVault = new AccountVault(() => join(getAppDirPath(), 'plugins', 'accounts'), safeStorage)
