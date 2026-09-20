---
pageClass: plugin-v2-doc
title: 6. 验证与真实接口
description: 验证登录、分页、音频和凭据边界，再构建并安装完成版。
prev:
  text: 导航、播放与导入
  link: /guide/plugins/v2/tutorial-account-native/playback
next:
  text: 原生内容 API
  link: /guide/plugins/v2/ui-native
---

# 6. 验证与真实接口

现在工程已经包含账号、Vue modal、Native View、Provider、播放和导入。本节先验证完成版，再说明替换真实平台接口时应该改哪一层。

## 1. 构建完成版

先保持音频服务运行：

```shell
npm run mock
```

另开终端执行：

```shell
npm run typecheck
npm run build
npm run validate
npm run preview
```

`validate` 应识别两个入口：

```text
Valid Ceru v2 artifact
id: tutorial.account-native
modules:
  - logic.main
  - view.account
signature: unsigned
```

如果 `typecheck` 通过而 `validate` 失败，优先检查 Manifest 声明和实际注册是否一致；校验的是最终 `dist/plugin.js`，不是源文件。

## 2. 按真实使用顺序检查

不要只看“构建成功”。按下面顺序走一遍，才能覆盖状态恢复和跨模块调用：

1. 未登录时，账号摘要显示“演示音乐账号”；Native View 只有“连接账号”；
2. 打开账号 modal 后取消，重新打开会生成新的 attempt；
3. 确认登录后 modal 自动关闭，摘要变成“演示体验用户”和 `SVIP`；
4. 停用再启用插件，会话从 Storage 恢复；
5. “歌单”页出现两张演示歌单，详情以两首为一页；
6. 搜索 `rain` 返回歌曲，允许播放权限后队列被替换并开始播放；
7. 解析地址返回的响应以 `RIFF` 开头，并且不是全静音数据；
8. `demo-favorites` 通过 importer 分页返回四首歌；
9. 退出账号后，Storage 会话删除，Provider 再次返回未登录错误。

还要检查边界输入：过期 attempt、负数游标、不属于本插件的 ref、不支持的音质、拒绝播放权限和已停止的音频服务，都应给出错误，不能返回看似成功的空结果。

## 3. 替换真实登录接口

演示登录只改 `account.start` 和 `account.poll` 附近的逻辑。真实插件通常按这个顺序完成登录：

1. `account.start` 请求平台取码接口，只向页面返回公开二维码内容和 attempt ID；
2. `account.poll` 使用同一个 attempt 查询状态；
3. 平台确认后，先用新凭据请求账号资料和会员状态；
4. 验证响应后再写入私有 Storage；
5. 生成 `publicAccount()`，发布公开状态并返回 `success`；
6. Vue 等动作成功返回后再关闭 modal。

所有 HTTP 请求都放在插件后台，通过 Manifest 声明的 `network.request` 权限调用 `ctx.http.request()`。如果目标是 `127.0.0.1` 或局域网地址，还要单独声明 `network.private`。

```ts
async function requestPlatform(
  path: string,
  body: JsonValue,
  operation: OperationContext
) {
  let grant = await ctx.permissions.query({ key: 'account.network' })
  if (grant.status !== 'granted') {
    grant = await ctx.permissions.request({
      key: 'account.network',
      intent: operation.userIntent
    })
  }
  if (grant.status !== 'granted') throw new Error('请允许插件访问平台服务')

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

检查 HTTP 状态、业务状态和字段类型后再使用响应。不要把完整响应或请求头写入日志。

## 4. 替换真实音乐数据

本例的 `data.ts` 是内存数组。接真实接口时，各模块职责保持不变：

| 文件 | 替换内容 | 保留的边界 |
| --- | --- | --- |
| `account.ts` | 取码、轮询、账号与会员请求 | 私密会话不进入公开 state |
| `provider.ts` | 搜索、歌单分页、播放地址 | 验证完整 ref 和当前连接 |
| `native.ts` | 标题、按钮和分区组合 | 只返回可克隆 JSON |
| `App.vue` | 展示真实二维码和状态 | 页面不长期保存凭据 |

真实 `resolve()` 应返回当前账号有权访问的短期 URL。媒体需要 Cookie 或 Referer 时，使用结果里的 `requestHeaders`，不要把请求头或临时 URL 写进 `ResourceRef.data`。

平台和音质标识使用[推荐约定](../source-conventions)。例如网易云常用 Provider ID `wy`；插件 ID 仍应使用你自己的唯一 ID。只声明真实支持的协议与音质。

## 5. 凭据检查

| 数据 | 私有 Storage | `AccountSummary` / Surface state | `ResourceRef` |
| --- | --- | --- | --- |
| 昵称、公开头像 | 可以 | 可以 | 通常不需要 |
| VIP/SVIP 结果 | 可以 | 只放短标签 | 不放 |
| Cookie、访问令牌 | 可以 | 不可以 | 不可以 |
| 会员接口原始响应 | 必要时短期保存 | 不可以 | 不可以 |
| 平台资源 ID | 可以 | 按界面需要 | 可以 |

退出时删除所有持久凭据。普通用户省略 `badge`，不要返回 `badge: "FREE"`；未知会员状态也不能猜成 VIP。

## 6. 安装与完成版

完成版用于对照，不需要在第一节提前下载：

- [完整源码 ZIP](/plugins/v2/tutorial/ceru-account-native.zip)
- [已校验的演示 plugin.js](/plugins/v2/tutorial/account-native/dist/plugin.js)
- <a href="/plugins/v2/tutorial/account-native/README.md">在线查看 README</a>

在澜音 2.0 打开“设置 → 插件管理 → 添加插件 → 本地导入”，选择 `dist/plugin.js`。本例播放时仍需在源码目录运行 `npm run mock`；账号登录、Native View 和歌单分页不依赖该服务。

发布自己的插件前，修改插件 ID、名称、作者、版本、说明和权限理由，并按[构建与发布](../publishing)完成签名与投稿。澜音 1.14.1 使用 v1 插件，不能安装本教程生成的 v2 成品。

常见错误：

- `validate` 仍读取旧结果：先重新执行 `npm run build`；
- 安装后没有歌单区块：确认已登录，并在软件已有的“歌单”页查看；
- 本地演示能登录但不能播放：`mock-audio.mjs` 不在成品内，需要单独运行；
- 真实接口在浏览器里能访问但插件被拒绝：检查 `network.request`，私网地址还要检查 `network.private`；
- 发布包带有个人 Cookie：打包前检查源码、日志和资源文件，凭据只能存在运行时私有 Storage。

完成后，你得到的是一条完整而可替换的账号插件结构：自定义登录交给 Web Surface，应用原生内容交给 Native View，搜索与播放数据交给 Provider，私密会话只留在后台和 Storage。
