/* eslint-disable vue/one-component-per-file -- Small UI-kit stubs share this component test harness. */
import { expect, test, jest } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { createRenderer, h, nextTick } from 'vue'
import * as contract from '@common/pluginHookControls'

type Node = {
  tag: string
  text: string
  props: Record<string, any>
  children: Node[]
  parent?: Node
}
const node = (tag: string, text = ''): Node => ({ tag, text, props: {}, children: [] })
const renderer = createRenderer<Node, Node>({
  createElement: (tag) => node(tag),
  createText: (text) => node('#text', text),
  createComment: (text) => node('#comment', text),
  setText: (el, text) => {
    el.text = text
  },
  setElementText: (el, text) => {
    el.text = text
    el.children = []
  },
  parentNode: (el) => el.parent ?? null,
  nextSibling: (el) => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
  patchProp: (el, key, _old, value) => {
    el.props[key] = value
  },
  insert: (el, parent, anchor) => {
    el.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(el)
    else parent.children.splice(index, 0, el)
  },
  remove: (el) => {
    if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1)
  }
})
const descendants = (root: Node): Node[] => [root, ...root.children.flatMap(descendants)]
const text = (root: Node): string =>
  descendants(root)
    .filter((el) => el.tag !== '#comment')
    .map((el) => el.text)
    .join(' ')

function mount(activity: contract.HookActivity[], pluginId?: string) {
  const api = jest.fn(async () => ({ activity }))
  const { descriptor } = parse(readFileSync(join(__dirname, 'PluginHookActivity.vue'), 'utf8'))
  const compiled = compileScript(descriptor, { id: 'hook-activity-test', inlineTemplate: true })
  const code = transformSync(compiled.content, { loader: 'ts', format: 'cjs' }).code
  const mod = { exports: {} as any }
  runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: (name: string) => {
      if (name === '@renderer/services/desktopBridge')
        return { desktopBridge: { api: { plugins: { hookControls: api } } } }
      if (name === '@common/pluginHookControls') return contract
      return require(name)
    }
  })
  const app = renderer.createApp(mod.exports.default, { pluginId })
  app.component('TButton', {
    setup:
      (_props, { slots }) =>
      () =>
        h('button', slots.default?.())
  })
  app.component('TTooltip', {
    props: {
      content: { type: String, default: '' },
      overlayInnerStyle: { type: Object, default: () => ({}) }
    },
    setup:
      (props, { slots }) =>
      () =>
        h(
          'span',
          { role: 'tooltip', content: props.content, style: props.overlayInnerStyle },
          slots.default?.()
        )
  })
  const root = node('root')
  app.mount(root)
  return {
    root,
    app,
    api,
    async open() {
      descendants(root)
        .find((el) => el.tag === 'details')!
        .props.onToggle({ currentTarget: { open: true } })
      await new Promise<void>((resolve) => setImmediate(resolve))
      await nextTick()
    }
  }
}

test('native tooltip explains the sanitized changes and filters by plugin', async () => {
  const view = mount(
    [
      {
        time: 1000,
        pluginId: 'fixture',
        name: 'queue.add',
        source: 'ui',
        action: 'rewrite',
        summary: {
          target: 'input',
          changes: [
            { field: 'count', before: 4, after: 2 },
            { field: 'position', before: 'end', after: 'next' }
          ]
        }
      },
      { time: 1001, pluginId: 'other', name: 'account.switch', source: 'plugin', action: 'cancel' }
    ],
    'fixture'
  )
  try {
    await view.open()
    const tooltip = descendants(view.root).find((el) => el.props.role === 'tooltip')!
    expect(tooltip.props.content).toBe('歌曲数量：4 → 2\n入队位置：队列末尾 → 下一首')
    expect(tooltip.props.style.whiteSpace).toBe('pre-line')
    expect(text(view.root)).toContain('另 1 项')
    expect(text(view.root)).not.toContain('切换子账号')
    expect(descendants(tooltip).some((el) => el.props.tabindex === '0')).toBe(true)
  } finally {
    view.app.unmount()
  }
})

test('redacted summaries, cancellation and older records have clear fallback text', async () => {
  const view = mount([
    {
      time: 1000,
      pluginId: 'fixture',
      name: 'lyrics.transform',
      source: 'plugin',
      action: 'rewrite',
      summary: {
        target: 'result',
        changes: [
          { field: 'lyric', redacted: true },
          { field: 'lines', before: 10, after: 12 }
        ]
      }
    },
    { time: 1001, pluginId: 'fixture', name: 'link.open', source: 'ui', action: 'cancel' },
    { time: 1002, pluginId: 'fixture', name: 'search.query', source: 'system', action: 'rewrite' }
  ])
  try {
    await view.open()
    const tooltips = descendants(view.root).filter((el) => el.props.role === 'tooltip')
    expect(tooltips.map((el) => el.props.content)).toEqual([
      '歌词内容已更改（内容已隐藏）\n歌词行数：10 → 12',
      '已阻止本次操作',
      '操作参数已更改（内容已隐藏）'
    ])
    expect(text(view.root)).toContain('来源：系统')
  } finally {
    view.app.unmount()
  }
})
