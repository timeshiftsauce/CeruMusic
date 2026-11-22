import { mkdtemp, readFile, readdir, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { jest, test, expect, beforeEach, afterEach } from '@jest/globals'
import { join } from 'node:path'
import { AccountVault } from '../accounts/vault'

jest.mock('electron', () => ({ safeStorage: {} }))
jest.mock('../../../utils/path', () => ({ getAppDirPath: () => '' }))
const owner = { pluginId: 'installed', accountId: 'music' }
const other = { ...owner, pluginId: 'preview' }
const cipher = {
  isAsyncEncryptionAvailable: jest.fn(async () => true),
  getSelectedStorageBackend: jest.fn(() => 'gnome_libsecret' as const),
  encryptStringAsync: jest.fn(async (text: string) => Buffer.from(text).reverse()),
  decryptStringAsync: jest.fn(async (data: Buffer) => ({ result: Buffer.from(data).reverse().toString(), shouldReEncrypt: false }))
}
let directory: string, vault: AccountVault
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'ceru-account-vault-')); vault = new AccountVault(() => directory, cipher, 'win32') })
afterEach(async () => { await rm(directory, { recursive: true, force: true }); jest.clearAllMocks() })

test('two connections remain separate across reload and deleting one leaves the second', async () => {
  const first = await vault.create(owner, 'private-first'), second = await vault.create(owner, 'private-second')
  const reopened = new AccountVault(() => directory, cipher, 'win32')
  expect(await reopened.read(owner, first)).toBe('private-first')
  await reopened.forget(owner, first)
  await expect(reopened.read(owner, first)).rejects.toThrow('不可用')
  expect(await reopened.read(owner, second)).toBe('private-second')
})
test('installed and preview plugins cannot use one another’s references or substituted ciphertext', async () => {
  const first = await vault.create(owner, 'private-first'), second = await vault.create(other, 'private-second')
  await expect(vault.read(other, first)).rejects.toThrow('不可用')
  await expect(vault.read({ ...owner, accountId: 'another' }, first)).rejects.toThrow('不可用')
  const files = (await readdir(directory, { recursive: true })).filter(name => name.endsWith('.bin'))
  const locate = (id: string) => join(directory, files.find(file => file.endsWith(id + '.bin'))!)
  expect((await readFile(locate(first.id))).includes('private-first')).toBe(false)
  await copyFile(locate(first.id), locate(second.id))
  await expect(vault.read(other, second)).rejects.toThrow('不可用')
  await vault.forgetPlugin(other.pluginId)
  expect(await vault.read(owner, first)).toBe('private-first')
})
test('unsupported encryption and insecure Linux backends fail closed without writing files', async () => {
  cipher.isAsyncEncryptionAvailable.mockResolvedValueOnce(false)
  await expect(vault.create(owner, 'private-first')).rejects.toThrow('系统安全存储不可用')
  const insecure = new AccountVault(() => directory, { ...cipher, getSelectedStorageBackend: () => 'basic_text' }, 'linux')
  await expect(insecure.create(owner, 'private-second')).rejects.toThrow('系统安全存储不可用')
  expect(cipher.encryptStringAsync).not.toHaveBeenCalled()
  expect(await readdir(directory)).toEqual([])
})
