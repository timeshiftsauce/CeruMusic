import { afterEach, expect, jest, test } from '@jest/globals'
import { HostServices } from '../hostServices'
import { callPluginUI } from '../uiBridge'
import { libraryBus } from '../operations/bus'

function mockCore(entry: string) {
  const requireNative = process.getBuiltinModule('module').createRequire(__filename)
  const root = process.env.CERU_TOOLING_ROOT
  return requireNative(
    root
      ? `${root}/packages/core/dist/${entry === 'operations' ? 'operation-bus' : entry}.js`
      : `@shiqianjiang/ceru-plugin-core/${entry}`
  )
}
jest.mock('electron', () => ({
  app: {},
  BrowserWindow: {},
  clipboard: {},
  dialog: {},
  globalShortcut: {},
  nativeTheme: {},
  Notification: {},
  shell: {}
}))
jest.mock('../musicRegistry', () => ({ musicRegistry: {} }))
jest.mock('../sharing', () => ({}))
jest.mock('../uiBridge', () => ({ callPluginUI: jest.fn() }))
jest.mock('@shiqianjiang/ceru-plugin-core/contract', () => mockCore('contract'))
jest.mock('../operations/bus', () => {
  const { OperationEngine, LIBRARY_OPERATIONS, libraryInput } = mockCore('operations')
  return { libraryBus: new OperationEngine(LIBRARY_OPERATIONS, libraryInput) }
})

const playlist = { id: 'list-1', name: 'Playlist', location: 'local' }
const track = {
  ref: { kind: 'track', providerId: 'demo', id: 'one' },
  title: 'One',
  metadata: { artists: [] }
}
const examples = {
  'playlist.create': { name: 'New playlist', location: 'local' },
  'playlist.delete': { playlist },
  'playlist.addTracks': { playlist, tracks: [track] },
  'playlist.removeTracks': { playlist, tracks: [track] },
  'playlist.import': { value: 'https://example.test/list', importerId: 'demo:lists' },
  'playlist.export': { playlist, format: 'cmpl' }
}
const permissions = [
  'library.write',
  'library.delete',
  'library.write',
  'library.delete',
  'library.write',
  'library.read'
]
const bridge = jest.mocked(callPluginUI)
const disposables: { dispose(): void }[] = []
afterEach(() => {
  for (const item of disposables.splice(0)) item.dispose()
  bridge.mockReset()
})

function setup() {
  const host = new HostServices(
    () => 'caller-file',
    () => false,
    () => {}
  )
  disposables.push(host)
  const granted = new Set(permissions)
  const authorize = jest.fn(async (key: string, permission: string) => {
    if (key !== permission || !granted.has(permission)) throw Error('Permission denied')
  })
  const services = host.bindV3(
    async () => {
      throw Error('Unexpected legacy method')
    },
    {} as any,
    {} as any
  )
  const dispatch = mockCore('dispatch').createDispatcher(services, {
    pluginId: 'test.caller',
    manifest: { id: 'test.caller' },
    authorize,
    log: { debug() {}, warn() {} }
  })
  const call = (
    name: string,
    input: unknown,
    permission = permissions[Object.keys(examples).indexOf(name)]
  ) =>
    dispatch('services.app.call', {
      args: [
        name,
        input,
        {
          permissionKey: permission,
          operation: { id: crypto.randomUUID(), deadlineAt: Date.now() + 10_000 }
        }
      ]
    })
  bridge.mockResolvedValue(null)
  return { host, granted, authorize, call, dispatch }
}

test('actual host dispatch authorizes all six playlist tools and forwards exactly once with cancellation', async () => {
  const { call, authorize, dispatch } = setup()
  const directory = await dispatch('services.app.operations.list', { args: [] })
  expect(
    directory.filter((tool: any) => tool.name.startsWith('playlist.')).map((tool: any) => tool.name)
  ).toEqual(Object.keys(examples))
  for (const [index, [name, input]] of Object.entries(examples).entries()) {
    bridge.mockClear()
    await expect(call(name, input)).resolves.toBeNull()
    expect(authorize).toHaveBeenLastCalledWith(permissions[index], permissions[index])
    expect(bridge).toHaveBeenCalledTimes(1)
    expect(bridge).toHaveBeenLastCalledWith(
      'caller-file',
      'operation.playlistTool',
      { name, input },
      expect.any(AbortSignal)
    )
  }
})

test('a real isolated worker calls all six tools through the actual host dispatcher', async () => {
  const { dispatch, granted } = setup()
  const requireNative = process.getBuiltinModule('module').createRequire(__filename)
  const issuer = requireNative(
    process.env.CERU_TOOLING_ROOT
      ? `${process.env.CERU_TOOLING_ROOT}/packages/issuer/dist/index.js`
      : '@shiqianjiang/ceru-plugin-issuer'
  )
  const manifest = {
    manifestVersion: 3,
    id: 'test.caller',
    name: 'Playlist tools',
    version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'logic.main' } },
    provides: { actions: [{ id: 'run', title: 'Run' }] },
    uses: {
      permissions: [...new Set(permissions)].map((name) => ({
        key: name,
        name,
        reason: 'Test playlist tools'
      }))
    }
  }
  const code = `exports.manifest=${JSON.stringify(manifest)};exports.activate=ctx=>{
    ctx.actions.register('run',async(_input,operation)=>{
      const results=[];
      for(const [index,[name,input]] of ${JSON.stringify(Object.entries(examples))}.entries())
        results.push(await ctx.app.call(name,input,{operation,permissionKey:${JSON.stringify(permissions)}[index]}));
      return results;
    });
  }`
  const worker = new (mockCore('node').NodePluginSandbox)(dispatch, () => {})
  disposables.push(worker)
  await worker.start(issuer.readArtifact(code))
  await expect(worker.invoke('action', 'run', '', [{}])).resolves.toEqual(Array(6).fill(null))
  expect(bridge).toHaveBeenCalledTimes(6)
  bridge.mockClear()
  granted.delete('library.write')
  await expect(worker.invoke('action', 'run', '', [{}])).rejects.toThrow('Host request failed')
  expect(bridge).not.toHaveBeenCalled()
})

test('actual host obeys playlist rewrites, cancellation, ownership and hook revocation', async () => {
  const { call } = setup()
  let granted = true
  let reply: any = { input: { name: 'Rewritten', location: 'local' } }
  const seen: any[] = []
  const guard = libraryBus.connect(
    'test.guard',
    () => granted,
    async (...args: any[]) => {
      seen.push(args)
      return reply
    }
  )
  guard.register('playlist.create', 'normal')
  guard.register('playlist.delete', 'normal')
  guard.attach()
  disposables.push(guard)
  await call('playlist.create', examples['playlist.create'])
  expect(JSON.stringify(seen[0])).toContain('test.caller')
  expect(JSON.stringify(seen[0])).toContain('plugin')
  expect(bridge.mock.calls[0][2]).toEqual({ name: 'playlist.create', input: reply.input })
  bridge.mockClear()
  reply = { prevented: true }
  await expect(call('playlist.delete', examples['playlist.delete'])).resolves.toBeNull()
  expect(bridge).not.toHaveBeenCalled()
  granted = false
  await call('playlist.delete', examples['playlist.delete'])
  expect(bridge).toHaveBeenCalledTimes(1)
  granted = true
  bridge.mockClear()
  reply = { input: { playlist: { ...playlist, id: 'other-list' } } }
  await call('playlist.delete', examples['playlist.delete'])
  expect(bridge.mock.calls[0][2]).toEqual({
    name: 'playlist.delete',
    input: examples['playlist.delete']
  })
})

test('permissions, private handles and malformed payloads fail before the renderer is called', async () => {
  const { call, granted } = setup()
  granted.delete('library.delete')
  await expect(call('playlist.delete', examples['playlist.delete'])).rejects.toThrow(
    'Permission denied'
  )
  await expect(call('playlist.removeTracks', examples['playlist.removeTracks'])).rejects.toThrow(
    'Permission denied'
  )
  await expect(
    call('playlist.export', examples['playlist.export'], 'library.write')
  ).rejects.toThrow('Permission denied')
  await expect(
    call('playlist.addTracks', {
      playlist,
      tracks: [{ ...track, ref: { ...track.ref, providerId: 'private' } }]
    })
  ).rejects.toThrow()
  await expect(call('playlist.import', { value: 'file:///secret' })).rejects.toThrow()
  await expect(
    call('playlist.create', { ...examples['playlist.create'], description: 'secret' })
  ).rejects.toThrow()
  await expect(call('player.resolve', {}, 'library.read')).rejects.toThrow('not callable')
  expect(bridge).not.toHaveBeenCalled()
})

test('revocation while hooks wait prevents default execution; renderer failures reach the caller', async () => {
  const { host, call } = setup()
  const guard = libraryBus.connect(
    'test.revoke',
    () => true,
    async () => {
      host.revokeAccess()
      return {}
    }
  )
  guard.register('playlist.create', 'normal')
  guard.attach()
  disposables.push(guard)
  await expect(call('playlist.create', examples['playlist.create'])).rejects.toThrow()
  expect(bridge).not.toHaveBeenCalled()
  guard.dispose()
  bridge.mockRejectedValue(new Error('Playlist storage failed'))
  await expect(call('playlist.export', examples['playlist.export'])).rejects.toThrow(
    'Playlist storage failed'
  )
})
