exports.manifest = {
  manifestVersion: 2,
  id: 'example.early-schema',
  name: '早期 v2 页面',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: {
    logic: { entry: 'logic.main' },
    surfaces: [{ id: 'hello', kind: 'schema', entry: 'view.hello' }],
  },
}

exports.activate = function () {}
exports.resources = {
  'view.hello': {
    type: 'json',
    value: {
      schemaVersion: '1.0',
      id: 'hello',
      root: { type: 'section', title: 'Hello', children: [] },
    },
  },
}
