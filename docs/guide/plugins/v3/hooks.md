---
pageClass: plugin-v3-doc
title: 操作 Hook、事件与离线测试
---

# 操作 Hook、事件与离线测试

> **适用读者**　需要改变播放或队列行为的作者。**前置条件**　支持 v3 的桌面，Node.js 22.12 或更新版本。**学习目标**　通过离线场景区分放行、拦截、改写和撤权。预计 15 分钟。

<PluginDiagram src="/plugins/v3/diagrams/hook.svg" alt="同一次点播的三个观察点，用户点播、规则判断、查看结果" />

Vue hooks 用来在组件里取桥接和状态。这里的 **操作 Hook** 在 Logic 中注册，能在宿主执行点播、排队、搜索等操作前改变其行为。只需要知道发生了什么时，用事件订阅。

## 先判断挂在哪里

用户点一首歌时，宿主已经知道要执行 `player.play`。如果你要禁止某些标题，就在执行前决定是否取消；如果你只是统计结果，就订阅 `player.play:done`。观察一次已经结束的点播，不必占用下一次点播的拦截时间。

| `ctx.hooks.on` 的参数 | 必填 | 类型与作用 |
| --- | --- | --- |
| `name` | 是 | 公开操作名，例如 `'player.play'`。它决定输入、返回结果、权限与时限 |
| `handler` | 是 | `(op, next) => …`。从 `op.input` 读取本次输入，`op.source` 表明来源；传给 `next` 的值须满足该操作的契约 |
| `options` | 否 | 可指定 `priority` 为 `early`、`normal` 或 `late`。处理器应容许其他插件也参与同一操作 |

注册会返回解绑函数。运行期间暂时关闭规则时调用它，重新开启时再注册。要读取 `op.state.player`、`route` 或 `account`，分别需要 `player.read`、`route.read` 或 `account.profile`；缺少对应许可时该项可以是 `null`。读取快照后，通过公开方法影响本次操作。

| 目标 | 写法 | 预期结果 |
| --- | --- | --- |
| 普通点播继续 | 在无匹配条件时返回，或在需要下游结果时 `await next()` | 默认处理继续 |
| 拦住这一次点播 | 在可取消的 `player.play` 中调用 `op.preventDefault()` | 本次默认点播不执行 |
| 把匹配的歌曲排到下一首 | 在 `queue.add` 中 `await next({ ...op.input, position: 'next' })` | 下游看到新位置，其余字段保留 |
| 返回该操作允许的结果 | 使用匹配契约的返回值或 `op.respondWith(result)` | 例如歌词回调直接给出结果，需符合该操作的歌词结构 |

## 第一步：创建播放规则插件

```sh
npx --yes create-ceru-plugin@3.0.0 ceru-playback-rules --template playback-hook --lang ts
cd ceru-playback-rules
npm install
npm test
```

`npm test` 调用 `ceru-plugin test-hooks`。模板中有未授权放行、拦截、队列改写、备用源解析等 14 个离线场景。它会实际构建并运行沙箱逻辑，每个场景使用新的 worker，播放和宿主结果由测试工具模拟。

## 第二步：读一段实际拦截逻辑

打开清单。播放规则模板包含下面这项授权声明（`reason` 应写你的真实用途）：

```json
{
  "key": "intercept",
  "name": "player.intercept",
  "reason": "根据用户设置拦截指定歌曲或调整加入队列的位置"
}
```

将它放在 `manifest.uses.permissions` 数组中。模板已声明，在练习工程不必重复添加。打开 `src/index.ts`，查看 `definePlugin` 内对应注册：

```ts
ctx.hooks.on('player.play', (op) => {
  if (op.input.track.title.startsWith('[拦截示例]')) op.preventDefault()
})

ctx.hooks.on('queue.add', async (op, next) => {
  if (op.input.tracks.some(track => track.title.startsWith('[优先示例]'))) {
    await next({ ...op.input, position: 'next' })
  }
})
```

第一段遇到标记歌曲时取消点播；第二段把包含标记歌曲的**本次队列操作**改到下一首。两者没有匹配规则时沿用默认行为。返回前缀样例能在离线测试判定行为，实际规则应由用户控制并只处理必要的范围。

## 第三步：加一个离线场景

在 `tests/hooks.json` 的顶层数组追加下列对象（与上一项之间须加逗号）。因为只有开头匹配，此场景中的歌名应放行：

```json
{
  "name": "歌名中间的标记不拦截",
  "operation": "player.play",
  "granted": true,
  "input": {
    "track": {
      "ref": { "kind": "track", "providerId": "demo", "id": "middle" },
      "title": "晨光 [拦截示例]",
      "metadata": { "artists": ["Ceru Demo"] }
    }
  },
  "expect": {
    "prevented": false,
    "input": {
      "track": {
        "ref": { "kind": "track", "providerId": "demo", "id": "middle" },
        "title": "晨光 [拦截示例]",
        "metadata": { "artists": ["Ceru Demo"] }
      }
    }
  }
}
```

再运行 `npm test`，确认新增的场景通过。用 `granted: false` 重复带标记的测试能检验撤权后的预期。要验证歌词或分享结果等返回型操作，请在场景设置 `defaultResult` 和 `expect.result`，需要断言跳过默认执行时加 `expect.defaultCalled: false`。

## 第四步：去桌面验收

运行 `npm run dev`，在开发者模式添加产物。在插件权限设置里允许播放拦截。准备一首标题包含开头标记 `[拦截示例]` 的本地测试歌曲（以宿主列表显示的标题为准），从歌曲列表发起点播。授权时它应被拦截，取消授权后原点播应可用。到「管理设置 → 播放与队列」检查活动记录、暂停或恢复拦截。用未标记歌曲确认普通操作仍能执行。

## 按需求选接口

| 我想…… | 用什么 |
| --- | --- |
| 改写输入或有条件取消 | `ctx.hooks.on(name, (op, next) => ...)`；检查该操作是否允许取消、可改哪些字段 |
| 在可取消操作之前观察并阻止 | `ctx.events.on(name, event => ...)`；相应拦截权限 |
| 观察最终是否取消或失败 | `ctx.events.on('player.play:done', ...)`；完成事件权限，例如 `player.read` |
| 观测播放、路由或账号变化 | 订阅 `track.started`、`player.progress`、`route.changed`、`account.changed` 等实际事件，按对应权限声明 |
| 主动发起支持的宿主操作 | `ctx.app.operations.list()` 查可调用 schema，`ctx.app.call(name, input, call)` 使用该项主动调用权限 |

`next()` 放行原输入，`next(newInput)` 把新输入交给下游。多数操作只能放行一次。解析钩子 `player.resolve` 是例外，第一次返回 `{ ok: false }` 后可用不同输入再试一次，只获取成功状态。直接提供结果请按操作的返回契约使用 `op.respondWith(...)`。拦截、观察和主动调用使用不同的权限。不要在处理器里重新发起同一个操作，也不要把本次私有引用持久化。

在[操作权限速查](./operations)查看哪些操作可取消、需要什么权限、有哪些时限，再查对应的输入和返回 Schema。将网络准备放在操作之外，处理器用已有状态完成判断。宿主可以在撤权、异常或处理器暂停时沿用原流程。完整例子见 [Hook 与事件参考](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/docs/HOOKS-AND-EVENTS.md)。

## 下载并运行本章工程

解压后从 `hook-demo` 运行 `npm install` 和 `npm test`，可以从最后一个场景开始修改断言。 [下载播放 Hook 工程与 15 个离线场景（ZIP）](/plugins/v3/tutorial/downloads/playback-hook.zip)
