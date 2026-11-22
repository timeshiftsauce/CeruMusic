---
pageClass: plugin-v3-doc
title: 掌握插件生命周期
---

# 掌握插件生命周期

> 适用读者：已经跑通过一个 v3 工程的作者。前置条件：[创建工程并完成桌面预览](./quick-start)。预计 12 分钟。以下接口适用于 CLI / SDK 3.0.0 与支持 v3 的澜音桌面。

假设用户安装了你的插件，还没启用，随后升级了一次。初始化数据应该写在哪里？等用户点开页面才读取数据，还是升级时就完成迁移？答案取决于你要处理的是**一次安装、一段逻辑运行时间，还是一次页面挂载**。

| 你要管理的事 | 在哪里做 | 它何时会再次发生 |
| --- | --- | --- |
| 首次初始化自己的数据 | Logic 的 `onInstall` | 同一安装的普通启动不会重复初始化 |
| 注册动作、服务或运行期间的订阅 | Logic 入口或选项式 `setup(ctx)` | 新的正常逻辑实例启动时重新注册，包含重新加载 |
| 响应用户明确启用或停用 | `onEnable`、`onDisable` | 用户再次改变启停状态时 |
| 绑定当前页面的 DOM、动画和页面级计时器 | Vue 的挂载与卸载回调，或 Web 视图返回的清理函数 | 页面再次挂载时；离开页面后 Logic 可以继续运行 |

## 写法与参数：回调里的 ctx 从哪里来 {#registration}

**选项式**适合同时处理安装、升级和运行期事件。除 `setup` 外，生命周期方法按需填写。宿主会向选项式方法传入 `ctx` 作为第一个参数；例如 `onUpdate(ctx, { from })`。**函数式**沿用现有的 `definePlugin(ctx => …)`，在里面注册 `ctx.lifecycle.onUpdate(({ from }) => …)`，这里通过闭包访问同一个 `ctx`。回调可以返回 `void` 或 `Promise<void>`。

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin(ctx => {
  const stop = ctx.lifecycle.onThemeChange(theme => {
    ctx.log.info('当前深浅色', { theme })
  })
  return stop
})
```

`onThemeChange(...)` 等注册方法同步返回解绑函数，调用它可以提前停止这一项监听。Logic 入口可返回一个清理函数；需清理多项资源时分别交给 `ctx.effects.add(dispose)`。不要再为同一个工作注册一次选项式回调，否则一次变化可能做两遍。

## 安装、启停、升级与卸载 {#installation}

下表按 `ctx.lifecycle.onXxx(handler)` 的写法列出 **handler 的参数**；选项式在这些参数前增加 `ctx`。

| 方法 | handler 参数 | 触发时机与用途 |
| --- | --- | --- |
| `onInstall` | 无 | 首次安装后运行，可以检查自己的 storage，再写初始数据。安装可以先于启用，因此初始化不要依赖已有页面或正在提供的服务。 |
| `onEnable` | 无 | 插件由停用变为启用时运行。适合记录用户显式开启功能；重启桌面恢复上次的启用状态，不会再次表达这个用户操作。每次运行都要注册的动作放在 `setup`。 |
| `onDisable` | 无 | 显式停用时，宿主在销毁运行实例前通知。适合结束本次已开启的工作；需要一直保存的业务数据应在修改成功时就写入。 |
| `onUpdate` | `{ from: string }` | 已安装的同 ID 插件发生版本变更。旧版本取 `from`，新版本取 `ctx.plugin.version`。先检查旧数据实际形状再迁移；重装相同版本不会触发。 |
| `onUninstall` | 无 | 卸载前还能读到自己的数据，可完成短小的清理。回调完成或宿主的 5 秒时限到期后，安装文件和本地数据会被清除。 |

**停用的插件也可能需要迁移。** 宿主可以启动一个临时逻辑实例，专门调用安装、更新或卸载回调。选项式只登记对应方法，跳过正常 `setup`。函数式应同步登记这些监听，避免先联网、写入存储或等待异步初始化。临时实例可在目标回调中读取配置、读写自己的存储；网络清理需要已有授权，此时无法弹出新的授权请求。

## 桌面启动、窗口与退出 {#desktop}

| 方法 | handler 参数 | 怎样观察、适合做什么 |
| --- | --- | --- |
| `onAppReady` | 无 | 主窗口就绪，已启动的插件实例可以开始依赖桌面就绪的工作。晚启用会为新实例补发一次；来回切换页面不会重复投递。应在入口处尽早登记。 |
| `onWindowShow` | 无 | 主窗口从隐藏或最小化变为可见，可恢复可见期间的刷新。 |
| `onWindowHide` | 无 | 主窗口被隐藏或最小化，可暂停只服务于可见界面的刷新。 |
| `onWindowFocus` | 无 | 焦点回到主窗口，可刷新用户即将看到的短期状态。 |
| `onWindowBlur` | 无 | 焦点离开主窗口。例如切到编辑器时，窗口仍可能可见。 |
| `onBeforeQuit` | 无 | 正常退出时，宿主并行等待已登记的回调，所有插件合计最多 3 秒，回调无法取消退出。适合冲刷少量待写数据。强退或断电时可能没有机会执行。 |

要处理**用户关闭窗口前能否阻止这次操作**，请看 [window.close 操作 Hook](./operations)。要判断一次**页面导航**是否允许，请看[路由守卫](./routing)。这两种操作和退出通知的触发条件各不相同。

## 系统、网络和用户空闲 {#environment}

| 方法 | handler 参数 | 触发条件与处理建议 |
| --- | --- | --- |
| `onSuspend` | 无 | 系统通知即将挂起，可暂停非必要工作。仅最小化窗口不会产生这个系统事件。 |
| `onResume` | 无 | 系统从挂起恢复，可重新检查之前持有的连接是否有效。 |
| `onLock` | 无 | 系统报告锁屏，可暂停仅在用户在场时运行的任务。 |
| `onUnlock` | 无 | 系统报告解锁，可重新读取当前状态；仍应检查对应服务权限。 |
| `onOnline` | 无 | 主界面的 Chromium 从离线变为在线。可以安排重试；某个曲库服务器是否可用仍以实际请求为准。 |
| `onOffline` | 无 | Chromium 从在线变为离线，可向用户显示离线状态。首次报告只建立基线，因此启动时不会靠这两个方法获知初值。 |
| `onIdle(milliseconds, handler)` | 无 | 用户连续空闲达到阈值时触发一次；恢复活动后才可能再次达到阈值。阈值是至少 60,000 的安全整数，单位毫秒。选项式写成 `onIdle: { milliseconds: 60000, handler(ctx) { … } }`。 |

需要测试 `onIdle` 时，先激活插件，然后让电脑至少一分钟没有用户输入；持续空闲不会每分钟重复调用。要验证锁屏、解锁和睡眠恢复，在目标设备上执行对应系统操作，分别记录两端事件。

## 主题、语言、配置与权限 {#changes}

| 方法 | handler 参数 | 用新值还是重新读取 |
| --- | --- | --- |
| `onThemeChange` | `theme: 'light' 或 'dark'` | 深浅色真的改变时直接使用新值。重复选择同一深浅色不会触发；改强调色也不等于切换深浅色。 |
| `onLocaleChange` | `locale: string` | 主文档语言改变时收到规范化语言标记，例如 `zh-CN`。首次报告只建立基线。当前桌面没有可供用户切换界面语言的设置。 |
| `onConfigChange` | `keys: string[]` | 得到本插件实际新增、修改或删除的配置键。需要新值时重新调用 `ctx.config.get()`；重复保存相同值不会通知。 |
| `onPermissionChange` | `keys: string[]` | 对变化的授权键重新调用 `ctx.permissions.query({ key })`。键本身不能说明是允许还是撤销；撤权后应停止对应工作，并更新界面。 |

## 动手：给安装与更新留下可验证的记录 {#practice}

用[快速开始](./quick-start)中的创建命令创建一个单独练习工程，目录名改成 `lifecycle-demo`。为只练习 Logic，可在清单的 `manifest.entry` 只保留 `logic`，移除 `manifest.ui`、`manifest.provides` 和 `manifest.uses`，顶层 `entries` 只保留 `logic.main`。把 `src/index.ts` 完整替换为下面的代码。本练习从普通插件管理安装并查看插件日志，无需注册页面。

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin({
  async onInstall(ctx) {
    if (await ctx.storage.get('firstVersion') === null) {
      await ctx.storage.set('firstVersion', ctx.plugin.version)
    }
  },
  async onUpdate(ctx, { from }) {
    await ctx.storage.set('lastUpgrade', { from, to: ctx.plugin.version })
  },
  async setup(ctx) {
    ctx.log.info('逻辑启动', {
      firstVersion: await ctx.storage.get('firstVersion'),
      lastUpgrade: await ctx.storage.get('lastUpgrade'),
    })
  },
  onEnable(ctx) {
    ctx.log.info('用户启用')
  },
  onThemeChange(ctx, theme) {
    ctx.log.info('深浅色变化', { theme })
  },
})
```

1. 在练习工程运行 `npm install`、`npm run build` 和 `npm run validate`。在普通插件管理中添加 `dist/plugin.js` 并手动启用，用普通安装验证首次安装行为。
2. 在插件日志中找「逻辑启动」。模板初始版本为 `0.1.0` 时，`firstVersion` 应为 `0.1.0`，`lastUpgrade` 应为 `null`。切换一次桌面深浅色，再找「深浅色变化」及其新值。
3. 停用插件，将 `ceru.plugin.json` 的 `manifest.version` 改为 `0.2.0`，保留插件 ID，重新构建，再用新文件更新安装。手动启用后查看「逻辑启动」：首次版本仍为 `0.1.0`，升级记录应包含 `from: '0.1.0'` 和 `to: '0.2.0'`。
4. 保持启用，正常退出并重开桌面。对照这次启动后的新日志，可以观察每次逻辑运行与显式启用的区别。要重复“首次安装”，使用单独的练习插件；卸载会删除它的数据。

**没有升级记录时**，先核对使用的是普通安装、前后 ID 相同、变更的是清单版本。**配置或权限回调有记录但页面没有变化时**，先读取变化键对应的新状态，再把视图需要的数据发给页面。涉及存储结构变更的完整做法见[配置、存储与升级](./storage)。

## 下载并运行本章工程

解压后从 `lifecycle-demo` 运行构建，按本章步骤做普通安装和同 ID 升级。 [下载生命周期练习工程（ZIP）](/plugins/v3/tutorial/downloads/lifecycle.zip)
