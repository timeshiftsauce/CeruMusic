---
pageClass: plugin-v2-doc
title: Navidrome 连接与认证
description: 规范化服务器地址，生成 Subsonic 令牌并安全保存登录状态。
prev:
  text: Navidrome 项目
  link: /guide/plugins/v2/tutorial-navidrome/
next:
  text: Vue 连接页面
  link: /guide/plugins/v2/tutorial-navidrome/surface
---

# Navidrome 连接与认证

这一节只写后台逻辑。目标是让 `connection.save` 接收表单、调用 `ping` 验证，并返回不含秘密的状态。

## 1. 声明网络边界

在 `ceru.plugin.json` 中声明两项权限：

```json
{
  "permissions": [
    {
      "key": "navidrome.http",
      "name": "network.request",
      "reason": "访问你设置的 Navidrome 服务器"
    },
    {
      "key": "navidrome.private",
      "name": "network.private",
      "optional": true,
      "reason": "连接本机或局域网中的 Navidrome 服务器"
    }
  ]
}
```

公网反向代理通常只需第一项。本机、NAS 和局域网 IP 需要第二项。真实公网服务器应使用 HTTPS，避免认证查询参数在传输中暴露。

## 2. 理解 Subsonic 令牌

Navidrome 兼容 Subsonic API。每次请求携带：

```text
u = 用户名
s = 随机盐
t = md5(密码 + 盐)
v = API 版本
c = 客户端名称
f = json
```

在逻辑模块中使用宿主提供的加密工具，不依赖 Node.js 内置模块：

```ts
const crypto = ctx.modules.require('@ceru/crypto')
const salt = crypto.randomBytes(16).toString('hex')
const token = crypto
  .createHash('md5')
  .update(password + salt)
  .digest('hex')
```

原始密码只在这一步短暂存在。不要写入日志、Surface state、歌曲 ref 或 Storage。

::: warning 令牌仍然是凭据
盐和 token 可以重复用于认证。勾选“记住登录”时教程会保存它们，但宿主插件 Storage 不是系统密码保险箱。断开连接必须删除记录。
:::

## 3. 先 ping，再替换当前连接

完成版把候选连接传给 `ping`。只有服务器确认成功后，才替换内存中的当前账号：

```ts
const candidate = {
  id,
  serverUrl,
  username,
  salt,
  token,
  remember: input.remember === true,
  allowLocal: input.allowLocal === true
}

const response = await api(candidate, 'ping', {}, operation)
account = candidate
status = `已连接${response.serverVersion ? ` · ${response.serverVersion}` : ''}`
```

这样输入错误密码不会破坏原来可用的连接。`operation` 会继续传入权限请求和 HTTP 请求，关闭调用时可以取消。

## 4. 只发布安全状态

Surface 需要知道“是否连接、服务器和用户名”，但不应看到 token：

```ts
function publicState() {
  return {
    connected: !!account,
    status,
    serverUrl: account?.serverUrl ?? '',
    username: account?.username ?? '',
    remember: account?.remember ?? false,
    allowLocal: account?.allowLocal ?? true
  }
}

await ctx.ui.setState('connection', publicState())
```

`ctx.ui.setState` 是当前页面会话的显示状态；`ctx.storage` 才是跨重启保存的数据。二者不要混用。

## 5. 记住与退出

```ts
if (candidate.remember) await ctx.storage.set('connection.v1', candidate)
else await ctx.storage.delete('connection.v1')
```

退出时同时清内存和 Storage：

```ts
await ctx.storage.delete('connection.v1')
account = null
status = '已断开，保存的令牌已清除'
```

每个插件最多使用 **10 MiB（10,485,760 字节）** Storage。连接记录很小，但仍受 JSON 值、键名和完整记录字节数规则约束，详见 [Storage](../storage)。

**完成标志：** 正确密码显示已连接；错误密码保留原连接；断开后重新打开页面不再显示账号。

下一节：[让 Vue Surface 调用这些 Action →](./surface)
