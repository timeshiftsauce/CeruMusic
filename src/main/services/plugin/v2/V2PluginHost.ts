import { PluginCore, readPluginArtifact } from 'ceru-plugin-core-v2'
import { NodePluginSandbox } from 'ceru-plugin-core-v2/node'
import { SurfaceSession } from 'ceru-plugin-core-v2/surface'
import { createWebSurfaceDocument } from 'ceru-plugin-core-v2/surface-document'
import { GuestStore } from 'ceru-plugin-core-v2/guests'
import { SocketBroker } from 'ceru-plugin-core-v2/sockets'
import { requestNetwork } from 'ceru-plugin-core-v2/network'
import { assertNavigationRequest } from 'ceru-plugin-sdk-v2'
import DesktopPluginHost from '../shared/DesktopPluginHost'
import type {
  Activate,
  GuestOptions,
  Logger,
  RuntimeHooks,
  SelectedGuest,
  SurfaceAction
} from '../shared/runtime'
import { readV2Descriptor } from './manifest'
import { exportShareResolver } from './shareResolver'

export function prepareV2(code: string, hooks: RuntimeHooks) {
  const { artifact } = readPluginArtifact(code)
  const manifest = artifact.header.manifest
  const descriptor = readV2Descriptor(hooks.pluginId, manifest)
  const share = manifest.modules.share
  const worker = new NodePluginSandbox(hooks.rpc, hooks.event)
  return {
    descriptor,
    manifest,
    resources: artifact.resources,
    worker,
    share,
    requestNetwork,
    sockets: new SocketBroker(),
    start: () => worker.start(artifact),
    load: (activate: Activate) =>
      PluginCore.load(code, { host: { activate: (_artifact, context) => activate(context) } }),
    guests: (options: GuestOptions) => new GuestStore({ ...options, artifact }),
    document: (id: string, sessionId: string) => createWebSurfaceDocument(artifact, id, sessionId),
    surface: (id: string, action: SurfaceAction) => {
      const view = manifest.modules.surfaces?.find((item) => item.id === id)
      if (!view) throw new Error('插件未声明此页面')
      return new SurfaceSession(view, manifest, action)
    },
    navigation: (data: unknown) => assertNavigationRequest(data, manifest),
    resolver: (config: Record<string, unknown>, guest?: SelectedGuest) =>
      exportShareResolver(artifact, config, guest)
  }
}

export default class V2PluginHost extends DesktopPluginHost {
  constructor(code: string | null = null, logger: Logger = console) {
    super(prepareV2, code, logger)
  }
}
