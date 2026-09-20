---
pageClass: plugin-v2-doc
---

# 权限与能力检查

权限声明、用户授权和宿主实现是三件事。即使清单中声明了权限，也必须获得用户授权，且对应 Host 已接入该 API。

## 什么时候需要权限？

搜索代码里的本地数组不需要网络权限；换成服务器请求后，就需要声明“我为什么联网”，并由用户决定是否允许。

流程是：**声明用途 → 用户触发功能 → 申请权限 → 获准后执行**。如果用户拒绝，显示原因并停止这次操作即可。下面用网络访问说明怎么写。

## 声明权限

在 `manifest.permissions` 中声明：

```json
[
  {
    "key": "api",
    "name": "network.request",
    "reason": "从你配置的音乐服务读取曲目"
  },
  {
    "key": "lan",
    "name": "network.private",
    "reason": "连接你自己的局域网音乐服务器",
    "optional": true
  }
]
```

| 字段          | 用途                                         |
| ------------- | -------------------------------------------- |
| `key`         | 插件内稳定的权限标识，调用时传 permissionKey |
| `name`        | SDK 规定的权限名，如 network.request         |
| `reason`      | 向用户解释具体用途                           |
| `optional`    | 声明可选权限；拒绝后业务应降级               |
| `scope`       | 可选 JSON 范围声明；不等于宿主已实现范围过滤 |
| `requiredFor` | 可选功能标识数组，表达依赖关系               |

当前网络权限按公网/私网能力分组，**没有按域名或路径的白名单授权**。不要向用户描述成“仅允许访问某个域名”，却声明宽泛公网权限。

## 查询与申请 API

| 方法                                               | 参数                   | 返回                                 |
| -------------------------------------------------- | ---------------------- | ------------------------------------ |
| `getGranted()`                                     | 无                     | `Promise<PermissionGrant[]>`         |
| `query({ key, scope? })`                           | 已声明的 key、可选范围 | `Promise<{ status }>`                |
| `request({ key, scope?, intent? })`                | key、可选操作意图      | `Promise<{ status }>`                |
| `requestGroup({ group, keys?, scopes?, intent? })` | 权限组，可限制组内 key | `Promise<{ group, status, grants }>` |

`PermissionGrant` 包含 `key, name, scope, status`，以及可选 `group, expiresAt`。完整类型见[参考](./reference)。

`status` 可能为 `undeclared / prompt / granted / denied / expired / restricted / unavailable`。当前桌面主要返回前四种；不要把未知状态当成已允许。

## 在动作中按需申请

下面是注册动作的完整逻辑，清单需要声明前述两项权限及 `connect` 命令：

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.actions.register('connect', async (_input, operation) => {
    const result = await ctx.permissions.requestGroup({
      group: 'network',
      keys: ['api'],
      intent: operation.userIntent
    })
    if (result.status !== 'granted') {
      await ctx.ui.toast({ message: '请允许网络访问后再连接', level: 'warning' })
      return
    }
    // 连接内网前另申请 localNetwork 组。
  })
})
```

用户拒绝后不要循环弹窗。桌面将同组申请合并，并在当前运行期间避免反复打扰；用户可在设置 → 插件 → 权限中修改后重试。

![澜音文档演示插件的网络权限界面](/plugins/v2/desktop-permissions.png)

_开发构建界面示意；仅展示演示插件声明。_

## 权限组与支持

| 组                               | 权限名                                               | 当前桌面说明                                                              |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `network`                        | network.request、network.socket                      | HTTP、Socket                                                              |
| `localNetwork`                   | network.private、network.discovery                   | 私网许可已接入；发现服务并不因此可用                                      |
| `account`                        | account.profile                                      | 基本账号资料                                                              |
| `libraryRead / libraryManage`    | library.read / library.write                         | 歌单读取与导入                                                            |
| `guestPlugins`                   | guests.manage、guests.run                            | 安装与运行子插件                                                          |
| `libraryDelete`                  | library.delete                                       | SDK 声明，桌面无通用删除接口                                              |
| `playbackRead / playbackControl` | player.read / player.control、playback.fallback.hold | SDK 声明；通用播放器服务未接入                                            |
| 其他组                           | 文件、下载、剪贴板、设备、AI、后台任务等             | 查阅[逐方法支持表](./host-services)和[完整权限目录](./reference#资源目录) |

桌面 `requestGroup` 当前按组名与 keys 筛选静态声明；不要假定 `scopes`、`intent` 已实现动态范围授予。升级版本可能进一步实现这些契约。

## 撤销与错误

撤销网络权限会关闭连接并取消正在进行的请求。插件应停止对应操作、更新界面，允许用户主动重试。未声明权限会失败，不能靠 request 临时创造任意权限。

`ctx.capabilities.get(service)` 用来查询宿主服务是否接入，不是权限检查。桌面当前仅粗粒度报告 account/library；没有出现在列表的 API 不可仅凭名称推断，详见[宿主服务](./host-services)。
