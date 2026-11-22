exports.manifest = {
  manifestVersion: 2,
  id: 'example.handwritten',
  name: '手写单文件示例',
  version: '1.0.0',
  description: '不使用 npm、SDK import 或 CLI 的可见 + 不可见插件',
  engines: {
    hostApi: '^2.0.0',
    logicRuntime: 'ceru-js@1',
  },
  modules: {
    logic: { entry: 'logic.main' },
    surfaces: [{ id: 'hello', kind: 'web', entry: 'view.hello' }],
  },
  contributes: {
    commands: [{ id: 'open-hello', title: '打开示例', action: 'hello.open' }],
    sidebarItems: [{ id: 'hello', group: 'tools', title: '手写示例', view: 'hello' }],
  },
  permissions: [],
  dataSchemas: { config: 1, state: 1 },
}

exports.activate = async function (core) {
  const ui = require('@ceru/ui')

  core.effects.add(
    core.actions.register('hello.open', async function () {
      await ui.openView('hello')
    }),
  )
}

exports.surfaces = {
  hello: async function (ui) {
    const title = document.createElement('h2')
    title.textContent = '一个 JS 文件就能开发澜音插件'
    const detail = document.createElement('p')
    detail.textContent = '这个页面运行在隔离 Surface 中，没有使用 CLI 或第三方框架。'
    ui.root.replaceChildren(title, detail)
  },
}

exports.resources = {}
