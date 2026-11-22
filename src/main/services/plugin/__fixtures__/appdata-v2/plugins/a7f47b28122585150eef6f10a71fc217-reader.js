exports.manifest = {
  manifestVersion: 2,
  id: 'example.upgrade-reader',
  name: 'Upgrade reader',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } },
  contributes: { commands: [{ id: 'read', title: 'Read', action: 'read' }] },
  permissions: [{ key: 'network', name: 'network.request', reason: 'Read metadata', optional: true }]
}
exports.activate = function (ctx) {
  ctx.actions.register('read', async () => ({
    config: await ctx.config.get(),
    favorite: await ctx.storage.get('favorite')
  }))
}
