import { afterAll, beforeAll, beforeEach, expect, jest, test } from '@jest/globals'
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pluginService from '..'
import { callPluginUI } from '../uiBridge'
import { runLifecycleOnly } from '../v3/lifecycleOnly'
import { readInstalledArtifact } from '../runtimes'
import { getPluginPermissions } from '../pluginConfig'
import { readTrustedConsent, trustedPublisher, registerTrustedRuntimeStopper } from './consent'

let mockProfile: string
const mockEvents: string[] = []
let mockHostFailure = false
jest.mock('../../../utils/path', () => ({ getAppDirPath: () => mockProfile }))
jest.mock('electron', () => ({ dialog: {} }))
jest.mock('../accounts/vault', () => ({
  pluginAccountVault: { forgetPlugin: jest.fn(async () => {}) }
}))
jest.mock('../../networkProxy', () => ({ getRequestAgentsFor: jest.fn() }))
jest.mock('../logger', () => ({ __esModule: true, default: class {} }))
jest.mock('../uiBridge', () => ({
  callPluginUI: jest.fn(),
  pluginChanged: jest.fn(),
  cancelPluginUI: jest.fn()
}))
jest.mock('../musicRegistry', () => ({
  musicRegistry: {},
  setMusicOwnerOrder: jest.fn(),
  providerOwners: new Map(),
  capabilityOwners: new Map()
}))
jest.mock('../v2/V2PluginHost', () => ({ __esModule: true, default: class {} }))
jest.mock('../v3/V3PluginHost', () => ({
  __esModule: true,
  default: class {
    constructor() {
      mockEvents.push('construct')
    }
    async ensureReady() {
      mockEvents.push('ready')
      if (mockHostFailure) throw Error('fixture worker failure')
    }
    async loadPlugin() {
      await this.ensureReady()
    }
    async destroy() {
      mockEvents.push('destroy')
    }
    async invokePluginLifecycle(name: string) {
      mockEvents.push(name)
    }
    async publishLifecycle() {}
    attachMusic() {}
    isDisabled() {
      return false
    }
    getSupportedSources() {
      return {}
    }
    getPluginInfo() {
      return {}
    }
    getDescriptor() {
      return { permissions: [] }
    }
    getGrantedPermissions() {
      return []
    }
    setGrantedPermissions() {
      mockEvents.push('refresh-permissions')
    }
  }
}))
jest.mock('../v3/lifecycleOnly', () => ({
  runLifecycleOnly: jest.fn(async () => {
    mockEvents.push('lifecycle')
  })
}))
jest.mock('../v3/serviceRouter', () => ({
  pluginServices: { onChange: jest.fn(), missing: () => undefined }
}))
jest.mock('@shiqianjiang/ceru-plugin-core/services', () => ({
  dependencyOrder: () => ({ cycles: new Set() })
}))
jest.mock('ceru-plugin-core-v2/guests', () => ({ GuestStore: class {} }))
jest.mock('@shiqianjiang/ceru-plugin-core/guests', () => ({ GuestStore: class {} }))
jest.mock('../runtimes', () => ({
  sniffManifestVersion: () => 3,
  readInstalledArtifact: (code: string) => {
    const header = JSON.parse(code)
    return {
      runtime: 3,
      header,
      artifact: {
        header,
        codeDigest: code,
        signatureStatus: header.signature ? 'verified-untrusted' : 'unsigned'
      }
    }
  },
  describeInstalled: (_owner: string, parsed: any) => ({
    ...parsed.header.manifest,
    runtime: 3,
    dependencies: [],
    guestAdapters: [],
    permissions: parsed.header.manifest.uses.permissions,
    providers: [],
    actions: [],
    importers: [],
    lyricConverters: [],
    accounts: [],
    views: [],
    pages: [],
    homeSections: [],
    slots: [],
    menus: [],
    styles: [],
    services: [],
    regions: [],
    skins: [],
    nativeModules: []
  })
}))

function code(
  id: string,
  { optional = false, signed = true, publisher = 'fixture', trusted = true, version = '1.0.0' } = {}
) {
  return JSON.stringify({
    manifest: {
      id,
      name: id,
      publisher,
      version,
      entry: trusted ? { server: { runtime: 'node' } } : {},
      uses: {
        permissions: trusted
          ? [
              {
                key: 'trusted',
                name: 'runtime.trusted',
                optional,
                reason: 'Fixture needs a complete Node environment.'
              }
            ]
          : []
      }
    },
    signature: signed ? { publicKey: publisher + '-key' } : null
  })
}
beforeAll(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockProfile = mkdtempSync(join(tmpdir(), 'ceru-trusted-install-'))
  await pluginService.initializePlugins()
})
afterAll(() => {
  rmSync(mockProfile, { recursive: true, force: true })
  jest.restoreAllMocks()
})
beforeEach(() => {
  mockEvents.length = 0
  mockHostFailure = false
  jest.mocked(callPluginUI).mockReset()
  jest.mocked(runLifecycleOnly).mockClear()
})

test('cancelled or unsigned installs create no worker and execute no lifecycle', async () => {
  jest.mocked(callPluginUI).mockResolvedValue(null)
  await expect(pluginService.addPlugin(code('fixture.cancel'), 'fixture.js')).rejects.toThrow(
    '取消'
  )
  await expect(
    pluginService.addPlugin(code('fixture.unsigned', { signed: false }), 'fixture.js')
  ).rejects.toThrow('签名')
  expect(mockEvents).toEqual([])
  expect(runLifecycleOnly).not.toHaveBeenCalled()
})

test('installation persists the publisher-bound grant before its first lifecycle', async () => {
  jest.mocked(callPluginUI).mockImplementation(async () => {
    mockEvents.push('consent')
    return { choice: 'grant', acknowledged: true }
  })
  const source = code('fixture.granted')
  jest.mocked(runLifecycleOnly).mockImplementationOnce(async (owner, parsed) => {
    expect(
      readTrustedConsent(owner, parsed.header.manifest, trustedPublisher(parsed.artifact))
    ).toBe(true)
    mockEvents.push('lifecycle')
  })
  const result = await pluginService.addPlugin(source, 'fixture.js')
  expect(result).not.toHaveProperty('error')
  expect(mockEvents).toEqual(['consent', 'lifecycle'])
})

test('restricted optional install runs lifecycle with no trusted grant', async () => {
  jest.mocked(callPluginUI).mockResolvedValue({ choice: 'restricted' })
  jest.mocked(runLifecycleOnly).mockImplementationOnce(async (owner, parsed) => {
    expect(
      readTrustedConsent(owner, parsed.header.manifest, trustedPublisher(parsed.artifact))
    ).toBe(false)
  })
  const result = await pluginService.addPlugin(
    code('fixture.optional', { optional: true }),
    'fixture.js'
  )
  expect(result).not.toHaveProperty('error')
  expect(runLifecycleOnly).toHaveBeenCalledTimes(1)
})

test('update asks before replacement or worker startup and cancelled update preserves old file', async () => {
  const original = code('fixture.update', { trusted: false })
  const installed = await pluginService.addPlugin(original, 'fixture.js')
  await pluginService.setPluginEnabled(installed.pluginId!, true)
  mockEvents.length = 0
  jest.mocked(callPluginUI).mockImplementationOnce(async () => {
    mockEvents.push('consent')
    return null
  })
  await expect(
    pluginService.addPlugin(code('fixture.update', { version: '2.0.0' }), 'fixture.js')
  ).rejects.toThrow('取消')
  expect(mockEvents).toEqual(['consent'])
  expect(
    readFileSync(join(mockProfile, 'plugins', installed.pluginId + '-plugin.js'), 'utf8')
  ).toBe(original)
})

test('failed update rolls consent back; successful update prompts before worker then reuses consent', async () => {
  const installed = await pluginService.addPlugin(
    code('fixture.rollback', { trusted: false }),
    'fixture.js'
  )
  await pluginService.setPluginEnabled(installed.pluginId!, true)
  const next = code('fixture.rollback', { version: '2.0.0' })
  jest.mocked(callPluginUI).mockImplementation(async () => {
    mockEvents.push('consent')
    return { choice: 'grant', acknowledged: true }
  })
  mockEvents.length = 0
  mockHostFailure = true
  await expect(pluginService.addPlugin(next, 'fixture.js')).rejects.toThrow(
    'fixture worker failure'
  )
  expect(getPluginPermissions(installed.pluginId!)).toEqual([])
  expect(mockEvents.slice(0, 4)).toEqual(['consent', 'refresh-permissions', 'construct', 'ready'])
  mockEvents.length = 0
  mockHostFailure = false
  expect(await pluginService.addPlugin(next, 'fixture.js')).not.toHaveProperty('error')
  expect(mockEvents.slice(0, 4)).toEqual(['consent', 'refresh-permissions', 'construct', 'ready'])
  const parsed = readInstalledArtifact(next)
  expect(
    readTrustedConsent(
      installed.pluginId!,
      parsed.header.manifest,
      trustedPublisher(parsed.artifact)
    )
  ).toBe(true)
  jest.mocked(callPluginUI).mockClear()
  expect(
    await pluginService.addPlugin(code('fixture.rollback', { version: '3.0.0' }), 'fixture.js')
  ).not.toHaveProperty('error')
  expect(callPluginUI).not.toHaveBeenCalled()
})

test('revoked required plugin stops before lifecycle and cannot enable or uninstall-run code', async () => {
  jest.mocked(callPluginUI).mockResolvedValue({ choice: 'grant', acknowledged: true })
  const installed = await pluginService.addPlugin(code('fixture.revoke'), 'fixture.js')
  await pluginService.setPluginEnabled(installed.pluginId!, true)
  mockEvents.length = 0
  await pluginService.setTrustedConsent(installed.pluginId!, false)
  expect(mockEvents).toEqual(['destroy'])
  await expect(pluginService.setPluginEnabled(installed.pluginId!, true)).rejects.toThrow(
    '完全信任'
  )
  jest.mocked(runLifecycleOnly).mockClear()
  await pluginService.uninstallPlugin(installed.pluginId!)
  expect(runLifecycleOnly).not.toHaveBeenCalled()
})

test('optional revocation stops trusted process and refreshes the surviving sandbox snapshot', async () => {
  jest.mocked(callPluginUI).mockResolvedValue({ choice: 'grant', acknowledged: true })
  const installed = await pluginService.addPlugin(
    code('fixture.keep-sandbox', { optional: true }),
    'fixture.js'
  )
  await pluginService.setPluginEnabled(installed.pluginId!, true)
  const dispose = registerTrustedRuntimeStopper(installed.pluginId!, async () => {
    mockEvents.push('stop-trusted')
  })
  try {
    mockEvents.length = 0
    const detail = await pluginService.setTrustedConsent(installed.pluginId!, false)
    expect(detail?.granted).toBe(false)
    expect(mockEvents).toEqual(['stop-trusted', 'refresh-permissions'])
  } finally {
    dispose()
  }
})

test('offline ordinary permission save preserves consent and rejects a trusted grant', async () => {
  jest.mocked(callPluginUI).mockResolvedValue({ choice: 'grant', acknowledged: true })
  const source = code('fixture.offline-permissions')
  const installed = await pluginService.addPlugin(source, 'fixture.js')
  pluginService.savePermissions(installed.pluginId!, [])
  const parsed = readInstalledArtifact(source)
  expect(
    readTrustedConsent(
      installed.pluginId!,
      parsed.header.manifest,
      trustedPublisher(parsed.artifact)
    )
  ).toBe(true)
  expect(() => pluginService.savePermissions(installed.pluginId!, ['trusted'])).toThrow(
    '专用确认框'
  )
})

test('removing then reintroducing trust requires a fresh installation confirmation', async () => {
  jest.mocked(callPluginUI).mockResolvedValue({ choice: 'grant', acknowledged: true })
  await pluginService.addPlugin(code('fixture.reintroduced'), 'fixture.js')
  await pluginService.addPlugin(
    code('fixture.reintroduced', { trusted: false, version: '2.0.0' }),
    'fixture.js'
  )
  jest.mocked(callPluginUI).mockClear()
  await pluginService.addPlugin(code('fixture.reintroduced', { version: '3.0.0' }), 'fixture.js')
  expect(callPluginUI).toHaveBeenCalledTimes(1)
})

test('details explicitly disables and enables an already running optional plugin', async () => {
  jest.mocked(callPluginUI).mockResolvedValueOnce({ choice: 'restricted' })
  const installed = await pluginService.addPlugin(
    code('fixture.enable-trust', { optional: true }),
    'fixture.js'
  )
  await pluginService.setPluginEnabled(installed.pluginId!, true)
  mockEvents.length = 0
  jest.mocked(callPluginUI).mockResolvedValueOnce({ choice: 'grant', acknowledged: true })
  const detail = await pluginService.setTrustedConsent(installed.pluginId!, true)
  expect(detail?.granted).toBe(true)
  expect(mockEvents).toEqual(['onDisable', 'destroy', 'construct', 'ready', 'onEnable'])
})

test('uninstall removes only owned data/native directories and skin references', async () => {
  const installed = await pluginService.addPlugin(
    code('fixture.cleanup', { trusted: false }),
    'fixture.js'
  )
  const owner = installed.pluginId!
  for (const area of ['data', 'native']) {
    mkdirSync(join(mockProfile, 'plugins', area, owner, '1.0.0'), { recursive: true })
    writeFileSync(join(mockProfile, 'plugins', area, owner, '1.0.0', 'fixture'), 'temporary')
    mkdirSync(join(mockProfile, 'plugins', area, 'unrelated'), { recursive: true })
  }
  const skinFile = join(mockProfile, 'plugins', 'skins.json')
  const unrelated = { pluginId: 'unrelated', skinId: 'other', values: { color: 'blue' } }
  writeFileSync(
    skinFile,
    JSON.stringify({
      version: 1,
      selected: { pluginId: owner, skinId: 'removed' },
      overrides: {
        title: { pluginId: owner, view: 'removed' },
        footer: { pluginId: 'unrelated', view: 'keep' }
      },
      settings: [{ pluginId: owner, skinId: 'removed', values: {} }, unrelated],
      custom: 'preserved'
    })
  )
  await pluginService.uninstallPlugin(owner)
  for (const area of ['data', 'native']) {
    expect(existsSync(join(mockProfile, 'plugins', area, owner))).toBe(false)
    expect(existsSync(join(mockProfile, 'plugins', area, 'unrelated'))).toBe(true)
  }
  expect(JSON.parse(readFileSync(skinFile, 'utf8'))).toEqual({
    version: 1,
    selected: null,
    overrides: { footer: { pluginId: 'unrelated', view: 'keep' } },
    settings: [unrelated],
    custom: 'preserved'
  })
})
