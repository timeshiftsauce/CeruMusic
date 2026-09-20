---
pageClass: plugin-v2-doc
---

# Guest：兼容其他脚本

::: tip 桌面扩展
SDK 0.3.3 起公开下述 Guest 类型、管理方法和 bootstrap 契约。新工程请按[0.3.5 工具链更新](./sdk-upgrade)安装；运行行为仍需在桌面验证。
:::

Guest 是由一个 v2 父插件提供兼容运行环境的外部脚本。v2 安装器只接受自己的插件格式；LX 等脚本需要对应适配器，不是修改文件扩展名后直接安装。

## 安装关系

```text
澜音 v2 Host
  └─ v2 兼容环境插件（父插件）
       ├─ 声明 guestAdapters 与权限
       ├─ bootstrap 适配旧脚本的全局变量/回调
       └─ 用户导入的 Guest 脚本
```

`guest-adapter` 模板展示此结构，不是完整 LX 解析与适配实现。开始前先确定要兼容的脚本格式、方法和输出数据。

## 声明与边界

`contributes.guestAdapters` 的每个适配器包括：

| 字段                          | 作用                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| id / title / extensions       | 适配器身份、名称、可选扩展名                               |
| format / compatibilityProfile | 原格式和兼容约定                                           |
| bootstrap / runtime           | bootstrap 入口与运行时                                     |
| projectableProtocols          | 能投射到宿主的协议集合                                     |
| badge?                        | label、backgroundColor、textColor；颜色为十六进制 CSS 颜色 |

Manifest 的 guestPolicy 约束最大深度 `1`，网络为 `per-guest-user-approved`，且 `allowNativeCode / allowRemoteCodeExecution` 为 false。父插件声明 guests.manage、guests.run；Guest 网络另行由用户授权。

## 父插件 API

| API                                                | 返回                         | 桌面行为                          |
| -------------------------------------------------- | ---------------------------- | --------------------------------- |
| `guests.list()`                                    | `Promise<GuestInfo[]>`       | 当前已导入脚本列表                |
| `guests.import(adapterId)`                         | `Promise<GuestInfo \| null>` | 宿主选择文件并确认，取消返回 null |
| `guests.select(guestId \| null)`                   | `Promise<void>`              | 选择或取消选择脚本                |
| `guests.remove(guestId)`                           | `Promise<void>`              | 移除已导入脚本                    |
| `guests.invoke(guestId, method, input, operation)` | `Promise<JsonValue>`         | 调用兼容接口                      |
| `guests.prepareInstall / requestInstall`           | SDK 声明                     | 当前桌面 RPC 未接入，使用 import  |

GuestInfo 包含 id、adapterId、name、version、author?、state、selected、providers、error?。state 为 ready/stopped/error；Provider 包含 id、name、qualities、protocols。

父插件调用示例（清单需声明 adapter ID 和管理权限）：

```ts
ctx.actions.register('guest.import', async () => {
  const guest = await ctx.guests.import('legacy')
  if (guest) await ctx.guests.select(guest.id)
})
```

父插件不通过 import 获得外部脚本原文。调用前检查 guest state，并将旧格式结果转换为 v2 标准数据。

## Bootstrap 上下文

| API / 字段                | 用途                                                  |
| ------------------------- | ----------------------------------------------------- |
| scriptInfo                | name/version/author?/description?/homepage?/rawScript |
| guestId                   | 当前 Guest 身份                                       |
| expose(name, value)       | 向兼容环境暴露需要的全局值                            |
| ready({ providers })      | 报告初始化完成及 Provider                             |
| handle(handler)           | 注册方法调用处理器，返回 Disposable                   |
| invokeHost(method, input) | 通过限定桥调用宿主                                    |
| host / utils              | 环境信息与受支持计算工具                              |

rawScript 只在需要适配的 bootstrap 环境可见，不意味着父插件可以任意读写宿主文件或执行 Node 原生模块。

## 验证方式

工作台可检查 bootstrap 结构与构建产物；完整 Guest 安装、独立授权、选择、更新和移除应在桌面测试。必须覆盖用户取消、脚本初始化失败、不支持协议、授权拒绝和停用父插件后的资源清理。
