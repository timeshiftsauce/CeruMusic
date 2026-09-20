exports.manifest = {
  manifestVersion: 2,
  id: 'example.docs.hello',
  name: '澜音文档 · 问候',
  version: '0.1.0',
  description: '无需网络的 v2 手写插件示例',
  author: '澜音文档',
  license: 'MIT',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } },
  contributes: {
    commands: [{ id: 'hello', title: '问候', action: 'hello' }]
  },
  permissions: []
}

exports.activate = function (ctx) {
  ctx.actions.register('hello', async () => {
    await ctx.ui.notify({ key: 'hello', level: 'info', message: '你好，澜音！' })
  })
}
