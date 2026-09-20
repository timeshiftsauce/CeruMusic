---
pageClass: plugin-v2-doc
title: 替换真实接口并发布
description: 把演示登录换成真实平台请求，保护 Cookie，验证、构建并安装插件。
prev:
  text: 导航、播放与导入
  link: /guide/plugins/v2/tutorial-account-native/playback
next:
  text: 原生内容 API
  link: /guide/plugins/v2/ui-native
---

# 替换真实接口并发布

教程工程的“扫码”是本地状态机，音频是本机生成的短 WAV。它验证的是插件结构和 API 调用，不代表任何真实平台接口。

## 1. 把模拟动作换成平台接口

Manifest 已声明 <code>account.network</code>：

```json
{
  "key": "account.network",
  "name": "network.request",
  "optional": true,
  "reason": "请求登录、账号与音乐数据"
}
```

后台写一个窄的请求函数，所有登录、会员和音乐请求都从这里经过：

```ts
async function platformRequest(path: string, body: JsonValue, operation: OperationContext) {
  let grant = await ctx.permissions.query({ key: 'account.network' })
  if (grant.status !== 'granted') {
    grant = await ctx.permissions.request({
      key: 'account.network',
      intent: operation.userIntent
    })
  }
  if (grant.status !== 'granted') {
    throw new Error('请允许插件访问平台服务')
  }

  return ctx.http.request({
    permissionKey: 'account.network',
    url: API_ORIGIN + path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.cookie ? { Cookie: session.cookie } : {})
    },
    body: JSON.stringify(body),
    timeoutMs: 15_000,
    operation
  })
}
```

<code>ctx.http.request</code> 返回 <code>{ status, headers, body }</code>。检查 HTTP 状态、业务状态和响应结构后再读取字段；响应仍可能是不可信数据。把平台错误转换成清楚的插件错误，不要把完整响应或 Cookie 写入日志。

::: warning 私网需要单独授权
真实 API 位于 <code>127.0.0.1</code>、局域网 IP 或本地域名时，还要声明并请求 <code>network.private</code>。工作台网络默认更严格；完整超时与响应体限制见 [HTTP 请求](../http)。
:::

## 2. Cookie 与会员判断留在插件

建议把一次登录结果收敛成自己的内部结构：

```ts
type Session = {
  cookie: string
  profile: {
    id: string
    nickname: string
    avatarUrl: string
  }
  membership: {
    tier: 'FREE' | 'VIP' | 'SVIP'
    expiresAt?: number
  }
}
```

登录成功的顺序：

1. 校验轮询结果仍属于当前 attempt。
2. 使用新 Cookie 请求账号资料。
3. 请求会员接口并检查到期时间。
4. 写入插件私有 Storage。
5. 生成公开状态并调用 <code>setState</code>。
6. 返回 success；Vue 收到后调用 <code>context.close()</code>。

| 数据             | 可以放私有 Storage | 可以放 AccountSummary / state | 可以放 ResourceRef |
| ---------------- | ------------------ | ----------------------------- | ------------------ |
| 昵称、公开头像   | 是                 | 是                            | 通常不需要         |
| VIP/SVIP 结果    | 是                 | 是，只放短标签                | 不要               |
| Cookie、令牌     | 是                 | 不可以                        | 不可以             |
| 会员接口原始响应 | 必要时短期缓存     | 不可以                        | 不可以             |
| 平台资源 ID      | 是                 | 可按界面需要                  | 是                 |

会员到期时重新计算权益。无会员就省略 badge，不能把未知状态猜成 SVIP。

## 3. 网易云同类插件的标识

如果你实现网易云账号插件：

```json
{
  "id": "wy",
  "name": "网易云（账号）",
  "connectionMode": "single"
}
```

- Provider ID 仍是 <code>wy</code>，插件 ID 可以是你自己的唯一 ID。
- 与其他 <code>wy</code> Provider 按澜音的同音源选择规则互斥。
- ResourceRef 仍完整保留 <code>pluginId/providerId/connectionId/data</code>，确保详情和播放回到创建它的插件连接。
- 账号入口使用 <code>accountItems</code>；个人歌单通过 <code>playlistSections</code> 引用 native Surface，显示在软件现有“歌单”页；不要增加网易云侧边栏、“我的歌单”按钮或歌单抽屉。

平台接口、加密、Cookie 格式、会员规则和风控变化都由插件维护。宿主只实现通用协议。

## 4. 构建前完整验证

启动模拟音频：

```shell
npm run mock
```

另开终端：

```shell
npm run typecheck
npm run build
npm run validate
npm run preview
```

预期校验结果包含：

```text
Valid Ceru v2 artifact
id: tutorial.account-native
modules:
  - logic.main
  - view.account
signature: unsigned
```

检查清单：

```text
□ 未登录显示默认头像与“未登录”
□ 点击账号项自动打开 modal 并取新码
□ 关闭 modal 后不再轮询，重开生成新 attempt
□ 登录动作完成后页面自动关闭
□ 昵称、头像和 VIP/SVIP 同步更新；普通用户无 badge
□ 悬停账号项可以退出，退出后删除私有会话
□ 现有“歌单”页显示 playlistSections 区块，不新增侧边栏或抽屉
□ Native View 显示 grid/list，不创建 iframe 或 WebView
□ navigation.open 的 sectionId 能定位本插件声明的区块
□ 歌单详情通过 playlists.get 分页
□ 播放保留完整 ResourceRef，并经过 player.control 权限
□ Cookie 未出现在摘要、公开 state、ref 或日志
```

## 5. 安装与下载

下载：

- [完整源码 ZIP](/plugins/v2/tutorial/ceru-account-native.zip)
- [已校验的演示 plugin.js](/plugins/v2/tutorial/account-native/dist/plugin.js)
- <a href="/plugins/v2/tutorial/account-native/README.md">在线查看 README</a>

在澜音 **1.14.1+** 中打开“设置 → 插件管理 → 添加插件 → 本地导入”，选择 <code>dist/plugin.js</code>。演示音频需要同时运行 <code>npm run mock</code>；账号、Native View 和分页不依赖网络。

真实发布前修改插件 ID、作者、版本、说明和平台权限理由，并根据[构建与发布](../publishing)完成签名与社区投稿。

## 当前工具链版本

本教程按 SDK、Core、Issuer、CLI 和 create-ceru-plugin **0.3.5** 契约编写，使用了 <code>playlistSections</code>、<code>navigation.open({ page: 'playlist', sectionId })</code> 与 Web Surface 自动内容高度。0.3.4 已完成 CLI/Create 版本横幅修复。

安装后使用 <code>npm ls</code> 与锁文件确认 SDK 与 CLI 都是 0.3.5。不要混装版本，也不要把本教程的 <code>playlistSections</code> 改回旧的抽屉或首页入口；完整版本关系见[版本与兼容](../compatibility)。

## 宿主集成附录：避免 DataCloneError

这一段给澜音或其他 Host 维护者。插件开发者只需返回普通 JSON。

Native View 经过 IPC 传递，Electron 不能克隆 Vue 的响应式 Proxy。宿主组件应使用浅引用保存整个快照：

```ts
const view = shallowRef<NativeView>()

view.value = await renderNativeView()
```

不要把返回值放进深层 <code>ref()</code> 后，再把内部 <code>item.ref</code> 直接交给 IPC，否则点击歌单或播放时可能出现 <code>DataCloneError: An object could not be cloned</code>。回归测试应对动作参数执行 <code>structuredClone</code>，并覆盖歌单点击、卡片操作、单曲播放和播放全部。

::: tip 你已经完成了什么？
你创建了一个同时使用 Web Surface 与 native Surface 的 v2 插件，接通账号菜单、登录状态、原生歌单详情、播放和导入，并知道真实平台逻辑应放在哪一层。
:::
