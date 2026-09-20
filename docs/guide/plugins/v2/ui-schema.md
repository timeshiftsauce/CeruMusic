---
pageClass: plugin-v2-doc
title: 开发原生配置页
---

# 开发原生配置页

服务器地址、令牌、音质和开关一类设置适合使用 Schema Surface。你用 JSON 描述字段，澜音 2.0 负责渲染表单；插件后台只处理读取、校验和保存。

本页从一个新的 TypeScript 工程开始，完成一张可以保存和恢复默认值的设置表单。需要自由排版、列表或复杂交互时，请改用 [Vue 插件页面](./surfaces)。

## 1. 创建工程

```shell
npm create ceru-plugin@latest my-settings-drawer -- --template source --lang ts
cd my-settings-drawer
npm install
```

接下来只修改三个文件：

```text
ceru.plugin.json  声明配置页、动作和 JSON 资源
ui/settings.json  描述表单字段与按钮
src/index.ts      读取、校验并保存设置
```

## 2. 声明配置页

用下面内容完整替换 `ceru.plugin.json`：

```json [ceru.plugin.json]
{
  "manifest": {
    "manifestVersion": 2,
    "id": "tutorial.settings-drawer",
    "name": "设置抽屉",
    "version": "0.1.0",
    "description": "原生配置页教程",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1",
      "uiSchema": "^1.0.0"
    },
    "modules": {
      "logic": { "entry": "logic.main" },
      "surfaces": [{ "id": "settings", "kind": "schema", "entry": "schema.settings" }]
    },
    "contributes": {
      "commands": [
        { "id": "settings.load", "title": "读取设置", "action": "settings.load" },
        { "id": "settings.save", "title": "保存设置", "action": "settings.save" },
        { "id": "settings.reset", "title": "恢复默认值", "action": "settings.reset" }
      ],
      "settingsPages": [{ "id": "settings", "title": "插件设置", "view": "settings" }]
    },
    "permissions": [],
    "dataSchemas": { "config": 1, "state": 1 }
  },
  "entries": { "logic.main": "src/index.ts" },
  "resources": {
    "schema.settings": { "path": "ui/settings.json", "type": "json" }
  },
  "output": "dist/plugin.js"
}
```

这里有两条引用链：`settingsPages[].view` 指向 Surface 的 `id`，Surface 的 `entry` 指向 `resources` 中的 JSON 文件。表单用到的加载、保存和重置动作也都必须出现在 `contributes.commands`。

## 3. 编写表单

新建 `ui/settings.json`，写入完整内容：

```json [ui/settings.json]
{
  "schemaVersion": "1.0",
  "presentation": {
    "kind": "drawer",
    "placement": "right",
    "size": 480,
    "openAction": "settings.load"
  },
  "root": {
    "type": "form",
    "title": "插件设置",
    "submitAction": "settings.save",
    "submitLabel": "保存设置",
    "submitInput": { "source": "settings-form" },
    "children": [
      { "type": "text", "bind": "status", "label": "状态" },
      {
        "type": "text-input",
        "bind": "displayName",
        "label": "显示名称",
        "placeholder": "我的音乐服务",
        "required": true
      },
      {
        "type": "password",
        "bind": "accessToken",
        "label": "访问令牌",
        "description": "留空表示保留已经保存的令牌"
      },
      {
        "type": "number",
        "bind": "resultLimit",
        "label": "每页结果数",
        "required": true
      },
      { "type": "toggle", "bind": "autoPlay", "label": "搜索后自动播放" },
      {
        "type": "select",
        "bind": "quality",
        "label": "默认音质",
        "options": [
          { "label": "标准 · 128k", "value": "128k" },
          { "label": "高品质 · 320k", "value": "320k" },
          { "label": "无损 · FLAC", "value": "flac" }
        ]
      },
      {
        "type": "button",
        "label": "恢复默认值",
        "action": "settings.reset",
        "input": { "scope": "all" },
        "requires": "canReset"
      }
    ]
  }
}
```

`openAction` 在抽屉打开后读取已保存设置。底部保存按钮提交全部表单值，并在最后合并 `submitInput`；普通按钮也会提交当前表单值，再合并自己的 `input`。固定参数会覆盖同名表单字段。

`text` 只显示状态，不参与提交。`password` 会参与本次提交，但澜音不会从公开状态回填它，保存成功或失败后也会清空输入框。

## 4. 保存和发布状态

用下面内容完整替换 `src/index.ts`：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

type Quality = '128k' | '320k' | 'flac'
type Preferences = {
  displayName: string
  accessToken: string
  resultLimit: number
  autoPlay: boolean
  quality: Quality
}

const defaults: Preferences = {
  displayName: '我的音乐服务',
  accessToken: '',
  resultLimit: 20,
  autoPlay: false,
  quality: '320k'
}
const qualities: Quality[] = ['128k', '320k', 'flac']
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

function readPreferences(value: unknown): Preferences {
  if (!isObject(value)) return { ...defaults }
  return {
    displayName:
      typeof value.displayName === 'string' && value.displayName.trim()
        ? value.displayName.trim()
        : defaults.displayName,
    accessToken: typeof value.accessToken === 'string' ? value.accessToken : '',
    resultLimit:
      typeof value.resultLimit === 'number' &&
      Number.isInteger(value.resultLimit) &&
      value.resultLimit >= 1 &&
      value.resultLimit <= 100
        ? value.resultLimit
        : defaults.resultLimit,
    autoPlay: value.autoPlay === true,
    quality: qualities.includes(value.quality as Quality)
      ? (value.quality as Quality)
      : defaults.quality
  }
}

function readForm(input: unknown, current: Preferences): Preferences {
  if (!isObject(input)) throw new Error('表单内容无效')
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : ''
  if (!displayName || displayName.length > 40) throw new Error('显示名称应为 1 至 40 个字符')
  if (
    typeof input.resultLimit !== 'number' ||
    !Number.isInteger(input.resultLimit) ||
    input.resultLimit < 1 ||
    input.resultLimit > 100
  ) {
    throw new Error('每页结果数应为 1 至 100 的整数')
  }
  if (typeof input.autoPlay !== 'boolean') throw new Error('自动播放设置无效')
  if (!qualities.includes(input.quality as Quality)) throw new Error('请选择有效的音质')
  const token = typeof input.accessToken === 'string' ? input.accessToken.trim() : ''
  if (token.length > 512) throw new Error('访问令牌过长')
  return {
    displayName,
    accessToken: token || current.accessToken,
    resultLimit: input.resultLimit,
    autoPlay: input.autoPlay,
    quality: input.quality as Quality
  }
}

export default definePlugin(async (ctx) => {
  let preferences = readPreferences(await ctx.storage.get('preferences'))

  const publish = async (status: string) => {
    const state = {
      displayName: preferences.displayName,
      resultLimit: preferences.resultLimit,
      autoPlay: preferences.autoPlay,
      quality: preferences.quality,
      canReset: true,
      status
    }
    await ctx.ui.setState('settings', state)
    return state
  }

  ctx.actions.register('settings.load', () => publish('设置已载入'))

  ctx.actions.register('settings.save', async (input) => {
    if (!isObject(input) || input.source !== 'settings-form') {
      throw new Error('保存来源无效')
    }
    preferences = readForm(input, preferences)
    await ctx.storage.set('preferences', preferences)
    return publish(preferences.accessToken ? '设置已保存，访问令牌已记录' : '设置已保存')
  })

  ctx.actions.register('settings.reset', async (input) => {
    if (!isObject(input) || input.scope !== 'all') throw new Error('重置范围无效')
    preferences = { ...defaults }
    await ctx.storage.set('preferences', preferences)
    return publish('已恢复默认值')
  })
})
```

这里的三种数据不要混在一起：

| 数据 | 用途 | 本例 |
| --- | --- | --- |
| Storage | 跨重启保存插件私有数据 | 保存完整偏好和访问令牌 |
| Surface state | 回填当前页面，可被界面看到 | 发布名称、数量、开关、音质和状态 |
| Action input | 用户本次提交的数据 | 包含刚输入的令牌和固定参数 |

`publish()` 特意没有把 `accessToken` 放进 state。即使宿主还会过滤密码字段，插件也不应主动发布秘密。Storage 是插件私有持久化空间，但不是系统密码保险箱；高敏感凭据应尽量使用短期令牌，并提供撤销方式。

## 5. 运行和检查

```shell
npm run dev
```

工作台中可以确认 `settings · schema` 已加载，也可以运行 `settings.load`、`settings.save` 和 `settings.reset` 检查动作与状态。工作台只提供轻量 Schema 预览，不完整模拟桌面表单：正式提交按钮、必填校验、密码清空和下拉框行为必须安装到澜音 2.0 验证。

桌面验证步骤：

1. 构建并安装插件，在“设置 → 插件管理”中点击“插件设置”；
2. 输入显示名称和令牌，把结果数改为 `30`，选择 `flac`，点击“保存设置”；
3. 关闭后重新打开，名称、数量、开关和音质应恢复，令牌框应为空；
4. 不输入新令牌再次保存，原令牌应保留；
5. 点击“恢复默认值”，字段应回到示例默认值。

构建和检查命令：

```shell
npm run typecheck
npm run build
npm run validate
npm run preview
```

也可以下载[完成版设置抽屉工程](/plugins/v2/tutorial/ceru-settings-drawer.zip)对照。它是本页最终代码。

## 常见问题

**打开配置入口后提示页面不存在**

检查 `settingsPages[].view`、Surface 的 `id`、Surface 的 `entry` 和 `resources` 键名是否逐级对应。

**提示抽屉配置无效**

表单动作必须先在 `contributes.commands` 声明。`select` 至少要有一个选项，字段 `bind` 不能重复，抽屉尺寸只能是 280 至 1200。

**工作台看得到 Schema，但没有完整保存按钮**

这是工作台轻量预览的范围。构建插件并在澜音 2.0 的插件管理中验证正式表单。

**保存后令牌框仍为空**

这是预期行为。密码字段不会从 state 回填；本例中留空再次保存表示继续使用已存令牌。

**保存时报“请填写”或“字段格式无效”**

`required`、数值类型和下拉选项由宿主先检查，插件后台还会再次检查业务范围。不要依赖前端校验保护数据。

## 控件速查

| 控件 | 值与用途 |
| --- | --- |
| `text-input` | 字符串输入；支持占位文字、说明和必填 |
| `password` | 字符串输入；不从 state 回填，提交后清空 |
| `number` | 有限数值；具体整数和范围由插件再次校验 |
| `toggle` | 布尔值 |
| `select` | 字符串；值必须属于 `options` |
| `text` | 只显示绑定的 state，不提交 |
| `button` | 调用独立 Action，可带固定 `input` 和 `requires` |

Schema 和一次表单提交各自最多 64 KiB（按 `JSON.stringify(...).length` 计算）。一个页面最多 64 个子节点，文本输入最多 8192 个字符。更多字段格式和页面 API 见 [界面 API 参考](./reference#界面与交互)。
