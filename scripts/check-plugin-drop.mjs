import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import { build } from 'esbuild'

/**
 * 「拖入插件文件」入口。
 *
 * 这条链路真正的风险不是 UI，而是三件事：
 *  1. drop 必须 preventDefault —— 否则 Chromium 会把窗口导航到 file:// 地址，
 *     用户看到的是整页白屏而不是安装弹窗；
 *  2. 路径必须来自 webUtils.getPathForFile（File.path 在新版已移除），拿不到路径
 *     就不能假装安装成功；
 *  3. 只接受 .js，且多个文件要逐个入队 —— 否则非插件文件会污染安装队列。
 */
const source = await readFile('src/renderer/src/components/PluginDropOverlay.vue', 'utf8')
const script = compileScript(parse(source).descriptor, { id: 'plugin-drop-test' })

const mocks = {
  // script setup 不会把内部 ref 暴露给调用方，这里让 ref 自己登记到 state 上，
  // 便于断言「提示层当前是否可见」这一唯一可观察的状态。
  vue: `export const defineComponent = (options) => options;
export const ref = (value) => { const r = { value }; globalThis.state.refs.push(r); return r };
export const onMounted = (fn) => { globalThis.state.mount = fn };
export const onBeforeUnmount = (fn) => { globalThis.state.unmount = fn };`,
  '@renderer/services/desktopBridge': `export const desktopBridge = { api: window.api };`,
  'tdesign-vue-next': `export const MessagePlugin = {
  error: (message) => globalThis.state.errors.push(message),
  warning: (message) => globalThis.state.warnings.push(message)
};`
}

const result = await build({
  stdin: { contents: script.content, loader: 'ts', resolveDir: process.cwd() },
  bundle: true,
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'plugin-drop-dependencies',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => ({ path: args.path, namespace: 'mock' }))
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => {
          if (!mocks[args.path]) throw Error('Unexpected import: ' + args.path)
          return { contents: mocks[args.path], loader: 'js' }
        })
      }
    }
  ]
})

function fileEvent(files, name = 'drop') {
  return {
    name,
    defaultPrevented: false,
    dataTransfer: { types: ['Files'], files, dropEffect: 'none' },
    preventDefault() {
      this.defaultPrevented = true
    }
  }
}

async function mountOverlay({ paths }) {
  const state = { errors: [], warnings: [], queued: [], refs: [] }
  const listeners = new Map()
  const window = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type, handler) => {
      if (listeners.get(type) === handler) listeners.delete(type)
    },
    electron: {
      webUtils: {
        getPathForFile: (file) => (file.name in paths ? paths[file.name] : '')
      }
    },
    api: {
      plugins: {
        getPathForFile: (file) => (file.name in paths ? paths[file.name] : ''),
        queueExternalFile: async (filePath) => {
          state.queued.push(filePath)
          return { sequence: state.queued.length }
        }
      }
    }
  }
  const module = { exports: {} }
  runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    state,
    console,
    window
  })
  const bindings = module.exports.default.setup({}, { expose() {} })
  await state.mount()
  return { state, listeners, bindings, overlay: state.refs[0] }
}

const jsFile = (name) => ({ name })

// 1. 拖动文件：出现提示层并阻止默认行为；移出后提示层消失。
{
  const { state, listeners, overlay } = await mountOverlay({ paths: {} })
  const enter = fileEvent([jsFile('a.js')], 'dragenter')
  listeners.get('dragenter')(enter)
  assert.equal(overlay.value, true, 'dragenter must reveal the overlay')
  const over = fileEvent([jsFile('a.js')], 'dragover')
  listeners.get('dragover')(over)
  assert.equal(over.defaultPrevented, true, 'dragover must be cancelled or Chromium navigates away')
  assert.equal(over.dataTransfer.dropEffect, 'copy')
  // 子元素之间移动会连续触发 enter/leave，计数不能提前收起提示层。
  listeners.get('dragenter')(fileEvent([jsFile('a.js')], 'dragenter'))
  listeners.get('dragleave')(fileEvent([jsFile('a.js')], 'dragleave'))
  assert.equal(overlay.value, true, 'inner dragleave must not hide the overlay')
  listeners.get('dragleave')(fileEvent([jsFile('a.js')], 'dragleave'))
  assert.equal(overlay.value, false, 'leaving the window hides the overlay')
  assert.deepEqual(state.errors, [])
}

// 2. 拖动选中文本：完全忽略，不干扰页面自身的拖拽行为。
{
  const { listeners, overlay } = await mountOverlay({ paths: {} })
  const enter = {
    defaultPrevented: false,
    dataTransfer: { types: ['text/plain'], files: [] },
    preventDefault() {
      this.defaultPrevented = true
    }
  }
  listeners.get('dragenter')(enter)
  assert.equal(enter.defaultPrevented, false)
  assert.equal(overlay.value, false)
}

// 3. 拖入非 .js：报错且不入队。
{
  const { state, listeners } = await mountOverlay({ paths: {} })
  listeners.get('drop')(fileEvent([{ name: 'archive.zip' }]))
  assert.deepEqual(state.queued, [])
  assert.match(state.errors[0], /\.js/)
}

// 4. 拖入多个文件：只处理 .js，忽略其它并给出提示；路径来自 webUtils。
{
  const { state, listeners, overlay } = await mountOverlay({
    paths: { 'one.js': 'C:\\plugins\\one.js', 'two.js': '/tmp/two.js' }
  })
  const drop = fileEvent([jsFile('one.js'), { name: 'notes.txt' }, jsFile('two.js')])
  await listeners.get('drop')(drop)
  assert.equal(drop.defaultPrevented, true, 'drop must be cancelled to stop file:// navigation')
  assert.deepEqual(state.queued, ['C:\\plugins\\one.js', '/tmp/two.js'])
  assert.equal(state.warnings.length, 1)
  assert.match(state.warnings[0], /1 个非 \.js/)
  assert.equal(overlay.value, false, 'dropping closes the overlay')
}

// 5. 拿不到真实路径：必须报错，不能静默跳过安装。
{
  const { state, listeners } = await mountOverlay({ paths: {} })
  await listeners.get('drop')(fileEvent([jsFile('ghost.js')]))
  assert.deepEqual(state.queued, [])
  assert.match(state.errors[0], /无法读取/)
}

console.log('PASS: 拖拽提示层计数、drop 阻止默认导航、非 .js 拒绝、多文件逐个入队、缺失路径报错')
