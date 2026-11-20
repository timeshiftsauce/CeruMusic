import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals'
import {
  readTrustedConsent,
  requestTrustedConsent,
  trustedPublisher,
  trustedDeclaration,
  writeTrustedConsent,
  trustedConsentDetail,
  registerTrustedRuntimeStopper,
  stopTrustedRuntime
} from './consent'
import { getPluginPermissions, savePluginPermissions } from '../pluginConfig'
import { callPluginUI } from '../uiBridge'
import { PluginPermissions } from '../shared/permissions'

let mockProfile: string
jest.mock('../../../utils/path', () => ({ getAppDirPath: () => mockProfile }))
jest.mock('../uiBridge', () => ({ callPluginUI: jest.fn() }))

const manifest = (optional = false) => ({
  name: 'Fixture',
  version: '1.0.0',
  publisher: 'fixture-publisher',
  entry: {
    server: { runtime: 'node', lan: true },
    native: [{ name: 'fixture.node', platforms: { 'win32-x64': 'native' } }]
  },
  uses: {
    permissions: [
      {
        key: 'trusted',
        name: 'runtime.trusted',
        optional,
        reason: 'Run the fixture native decoder module.'
      }
    ]
  }
})
const artifact = (key = 'fixture-public-key') => ({
  header: { manifest: manifest(), signature: { publicKey: key } },
  signatureStatus: 'verified-untrusted'
})

beforeEach(() => {
  mockProfile = mkdtempSync(join(tmpdir(), 'ceru-trusted-consent-'))
  jest.mocked(callPluginUI).mockReset()
})
afterEach(() => rmSync(mockProfile, { recursive: true, force: true }))

test('publisher-bound consent survives code/version updates but rejects changed publisher, key, owner or scope', () => {
  const m = manifest(),
    publisher = trustedPublisher(artifact())!
  writeTrustedConsent('fixture', m, publisher, true)
  expect(readTrustedConsent('fixture', { ...m, version: '2.0.0' }, publisher)).toBe(true)
  expect(readTrustedConsent('other-owner', m, publisher)).toBe(false)
  expect(readTrustedConsent('fixture', m, trustedPublisher(artifact('another-key')))).toBe(false)
  expect(
    readTrustedConsent(
      'fixture',
      m,
      trustedPublisher({
        ...artifact(),
        header: { ...artifact().header, manifest: { ...m, publisher: 'other' } }
      })
    )
  ).toBe(false)
  expect(
    readTrustedConsent(
      'fixture',
      { ...m, uses: { permissions: [{ ...m.uses.permissions[0], scope: { changed: true } }] } },
      publisher
    )
  ).toBe(false)
  expect(
    JSON.parse(readFileSync(join(mockProfile, 'plugins/permissions/fixture.json'), 'utf8'))
  ).toEqual(getPluginPermissions('fixture'))
})

test('ordinary or legacy trusted grant cannot stand in for publisher-bound consent', () => {
  savePluginPermissions('fixture', ['trusted', 'trusted:runtime.trusted:{}'])
  expect(readTrustedConsent('fixture', manifest(), trustedPublisher(artifact()))).toBe(false)
})

test('production requires verified signature and development authorization cannot carry into production', async () => {
  const unsigned = {
    ...artifact(),
    signatureStatus: 'unsigned',
    header: { ...artifact().header, signature: null }
  }
  expect(trustedPublisher(unsigned)).toBeNull()
  await expect(requestTrustedConsent('fixture', manifest(), null)).rejects.toThrow('有效签名')
  expect(callPluginUI).not.toHaveBeenCalled()
  const development = trustedPublisher(unsigned, true)
  writeTrustedConsent('fixture', manifest(), development, true)
  expect(readTrustedConsent('fixture', manifest(), trustedPublisher(artifact()))).toBe(false)
  expect(readTrustedConsent('fixture', manifest(), development)).toBe(true)
})

test.each([true, {}, { choice: 'grant' }, { choice: 'grant', acknowledged: false }, null])(
  'rejects a missing or unchecked acknowledgement: %p',
  async (answer) => {
    jest.mocked(callPluginUI).mockResolvedValue(answer)
    await expect(
      requestTrustedConsent('fixture', manifest(), trustedPublisher(artifact()))
    ).rejects.toThrow('取消')
    expect(getPluginPermissions('fixture')).toEqual([])
  }
)

test('only explicit checkbox confirmation allows trusted installation and caller persists after preparation', async () => {
  jest.mocked(callPluginUI).mockResolvedValue({ choice: 'grant', acknowledged: true })
  expect(await requestTrustedConsent('fixture', manifest(), trustedPublisher(artifact()))).toBe(
    true
  )
  expect(callPluginUI).toHaveBeenCalledWith(
    'fixture',
    'host.trustedConsent',
    expect.objectContaining({ reason: manifest().uses.permissions[0].reason, optional: false })
  )
  expect(getPluginPermissions('fixture')).toEqual([])
})

test('only optional trust allows restricted installation', async () => {
  jest.mocked(callPluginUI).mockResolvedValue({ choice: 'restricted' })
  expect(await requestTrustedConsent('fixture', manifest(true), trustedPublisher(artifact()))).toBe(
    false
  )
  await expect(
    requestTrustedConsent('fixture', manifest(), trustedPublisher(artifact()))
  ).rejects.toThrow('取消')
})

test('unchanged grant skips confirmation while warnings expose native and LAN risks as plain text', async () => {
  const m = manifest(),
    publisher = trustedPublisher(artifact())
  writeTrustedConsent('fixture', m, publisher, true)
  expect(await requestTrustedConsent('fixture', m, publisher)).toBe(true)
  expect(callPluginUI).not.toHaveBeenCalled()
  expect(trustedConsentDetail('fixture', m, publisher)?.warning).toEqual(
    expect.arrayContaining([
      '可以访问你电脑上的所有文件，也可以启动其他程序',
      '将运行原生模块 fixture.node（win32-x64）',
      '局域网内的设备可以访问此插件的服务'
    ])
  )
})

test('revocation removes only consent and supports immediate runtime shutdown without stale cleanup', async () => {
  const m = manifest(),
    publisher = trustedPublisher(artifact())
  savePluginPermissions('fixture', ['network:network.request:{}'])
  writeTrustedConsent('fixture', m, publisher, true)
  const old = jest.fn(async () => {}),
    current = jest.fn(async () => {})
  const disposeOld = registerTrustedRuntimeStopper('fixture', old)
  const dispose = registerTrustedRuntimeStopper('fixture', current)
  disposeOld()
  writeTrustedConsent('fixture', m, publisher, false)
  expect(await stopTrustedRuntime('fixture')).toBe(true)
  expect(old).not.toHaveBeenCalled()
  expect(current).toHaveBeenCalledTimes(1)
  expect(readTrustedConsent('fixture', m, publisher)).toBe(false)
  expect(getPluginPermissions('fixture')).toContain('network:network.request:{}')
  expect(
    getPluginPermissions('fixture').some((record) =>
      record.startsWith('trusted-consent:v2:utility-unrestricted:restricted:')
    )
  ).toBe(true)
  dispose()
  expect(await stopTrustedRuntime('fixture')).toBe(false)
})

test.each([
  { ...manifest(), uses: { permissions: [] } },
  {
    ...manifest(),
    uses: {
      permissions: [{ ...manifest().uses.permissions[0], reason: '<b>pretend host warning</b>' }]
    }
  },
  {
    ...manifest(),
    uses: { permissions: [{ ...manifest().uses.permissions[0], reason: 'short' }] }
  },
  {
    ...manifest(),
    uses: { permissions: [manifest().uses.permissions[0], manifest().uses.permissions[0]] }
  }
])('rejects missing, duplicate or invalid trust declarations before UI: %p', (m) => {
  expect(() => trustedDeclaration(m)).toThrow()
  expect(callPluginUI).not.toHaveBeenCalled()
})

test('restricted choice survives ordinary updates but details can explicitly request trust later', async () => {
  const m = manifest(true),
    publisher = trustedPublisher(artifact())
  writeTrustedConsent('fixture', m, publisher, false)
  expect(await requestTrustedConsent('fixture', { ...m, version: '2.0.0' }, publisher)).toBe(false)
  expect(callPluginUI).not.toHaveBeenCalled()
  jest.mocked(callPluginUI).mockResolvedValue({ choice: 'grant', acknowledged: true })
  expect(await requestTrustedConsent('fixture', m, publisher, false, true)).toBe(true)
})

test('ordinary permission updates preserve current trust records and cannot grant or resurrect trust', () => {
  const m = manifest(),
    publisher = trustedPublisher(artifact())
  writeTrustedConsent('fixture', m, publisher, true)
  const permissions = new PluginPermissions(
    () => 'fixture',
    () => 'Fixture',
    () =>
      [
        ...m.uses.permissions,
        { key: 'network', name: 'network.request', reason: 'Connect to fixture' }
      ] as any,
    () => false,
    async () => {}
  )
  permissions.initialize()
  permissions.setGrantedPermissions(['network'])
  expect(readTrustedConsent('fixture', m, publisher)).toBe(true)
  expect(() => permissions.setGrantedPermissions(['network', 'trusted'])).toThrow('专用确认框')
  writeTrustedConsent('fixture', m, publisher, false)
  permissions.setGrantedPermissions([])
  expect(readTrustedConsent('fixture', m, publisher)).toBe(false)
})

test('old restricted-runtime approval never grants the utility process broader file access', async () => {
  const m = manifest(), publisher = trustedPublisher(artifact())!
  writeTrustedConsent('fixture', m, publisher, true)
  const current = getPluginPermissions('fixture')
  savePluginPermissions('fixture', current.map(record => record.replace('trusted-consent:v2:utility-unrestricted:', 'trusted-consent:v1:')))
  expect(readTrustedConsent('fixture', m, publisher)).toBe(false)
  jest.mocked(callPluginUI).mockResolvedValue({choice:'grant', acknowledged:true})
  expect(await requestTrustedConsent('fixture', m, publisher)).toBe(true)
  expect(callPluginUI).toHaveBeenCalledWith('fixture', 'host.trustedConsent', expect.objectContaining({
    warning: expect.arrayContaining(['可以访问你电脑上的所有文件，也可以启动其他程序'])
  }))
})

test('publisher identity comes from an artifact verified by the real issuer; signed metadata tampering fails', () => {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import { generateSigningKeys, signArtifact, readArtifact } from '@shiqianjiang/ceru-plugin-issuer';
    const manifest = { manifestVersion: 3, id: 'fixture.signed', name: 'Signed fixture', publisher: 'fixture-publisher', version: '1.0.0', engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' }, entry: { logic: { module: 'logic.main' } } };
    const key = generateSigningKeys();
    const signed = signArtifact(Buffer.from('exports.manifest=' + JSON.stringify(manifest) + ';exports.activate=ctx=>{};'), key.privateKey);
    const artifact = readArtifact(signed);
    let rejected = false;
    try { readArtifact(signed.toString().replace('fixture-publisher', 'changed-publisher')); } catch { rejected = true; }
    process.stdout.write(JSON.stringify({ header: artifact.header, signatureStatus: artifact.signatureStatus, rejected }));
  `
      ],
      { encoding: 'utf8' }
    )
  )
  expect(result.rejected).toBe(true)
  expect(result.signatureStatus).toBe('verified-untrusted')
  expect(trustedPublisher(result)).toContain('fixture-publisher')
  expect(trustedPublisher({ ...result, signatureStatus: 'unsigned' })).toBeNull()
})
