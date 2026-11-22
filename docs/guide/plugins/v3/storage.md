---
pageClass: plugin-v3-doc
title: 保存配置、迁移旧数据与共享读取
---

# 保存配置、迁移旧数据与共享读取

> **适用读者**　维护已安装插件的作者。**前置条件**　有一个能保存点击次数的插件。**学习目标**　让旧用户升级后保留计数。预计 8 分钟。

先打开[计数器](./first-plugin)工程。关掉页面再进来，Logic 通过 `storage.get('clicks')` 重建显示状态。若把次数只存在 Vue 的 ref 里，卸载视图后就会丢失。

| 内容 | 存放位置 | 读取时机 |
| --- | --- | --- |
| 作者提供的默认值 | 工程顶层 `config`，构建后进入清单 | Logic 调用 `ctx.config.get<T>()` |
| 用户修改后的偏好、计数、游标 | 本插件 `ctx.storage`，保存 JSON | 页面打开或动作执行时 |
| 加载状态、表单错误 | Vue 或 `ctx.ui.views.setState` 的显示快照 | 当前视图挂载期间 |
| 平台连接凭据 | 宿主账号接口 | 业务请求用宿主提供的凭据引用 |

## 练习：把数字迁移成对象

旧版把次数保存为数字，新版希望日后增加字段。保持 `manifest.id` 不变，把 `dataSchemas.state` 从 1 调为 2。在计数器的 `readCount` 中改用以下读取逻辑：

```ts
const stored = await ctx.storage.get(key)
const count = typeof stored === 'number' ? stored
  : stored && typeof stored === 'object' && !Array.isArray(stored) ? stored.count
  : undefined
return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : 0
```

把加一操作的写入改为 `await ctx.storage.set(key, { count })`。UI 继续接收 `{ count }`，不用知道用户先前安装的是哪个版本。先用旧版点到 2，再原位更新、进页面、再点一下，重启后应显示 3。缺失键返回 `null`，新安装的用户应从 0 开始。先兼容旧形状再写入新形状，可避免升级中断后旧数据无法读取。

## 允许另一个插件读取指定键

在所有者 Logic 中调用 `ctx.storage.set({ key: 'public-theme', readableBy: ['example.reader'] }, 'dark')`。读方调用 `ctx.storage.get({ pluginId: 'example.owner', key: 'public-theme' })`，其中两个示例 ID 换成对应清单 ID。未获准的跨插件读取会被拒绝。需要撤销时由所有者重新写入该键并指定 `readableBy: []`。不要把账号信息和可公开共享的设置存进同一个值。

## 用三份数据验证升级

| 测试起点 | 第一次读取 | 点「加一」后的持久值 |
| --- | --- | --- |
| 全新安装，没有 `clicks` | 界面显示 0 | `{ "count": 1 }` |
| 旧版已有数字 `2` | 界面显示 2 | `{ "count": 3 }` |
| 新版已经保存 `{ "count": 3 }` | 界面显示 3 | `{ "count": 4 }` |

先用上表第一行证明新装正常，再用独立测试配置走第二行。保留计数器例子里的写入队列；同时从两个页面提交时，让第二次更新等第一次写入完成。若结构要在安装更新时立即迁移，可在[onUpdate](./lifecycle#installation)处理，并保留读取旧形状的逻辑，以便迁移中途退出后重试。
