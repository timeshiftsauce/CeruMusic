---
pageClass: plugin-v2-doc
title: 验证并接入真实音源
description: 验证 HTTP 音源项目，并安全替换成你有权访问的真实音乐服务。
prev:
  text: 实现音源 Provider
  link: /guide/plugins/v2/tutorial-source/provider
next:
  text: 开发 Navidrome 插件
  link: /guide/plugins/v2/tutorial-navidrome/
---

# 验证并接入真实音源

先证明教程工程本身正确，再替换服务。这样出现问题时，你能判断错误来自插件还是 API。

## 完成四项检查

保持 mock 服务运行，在另一个终端执行：

```shell
npm run typecheck
npm run build
npm run validate
npm run preview
```

你应看到 `Valid Ceru v2 artifact`，产物位于 `dist/plugin.js`。在成品预览中再次检查：

- 搜索 `Morning` 返回一首歌。
- 搜索不存在的关键词返回空数组，而不是异常。
- resolve 返回 `ok: true` 和 `http://127.0.0.1:43120/...`。
- lyrics 返回 `format: "crlyric"`、`version: 1` 和毫秒时间。

## 换成你的服务

只替换三层，不必重写插件结构：

| 位置                        | 替换什么                 | 保留什么                                       |
| --------------------------- | ------------------------ | ---------------------------------------------- |
| `manifest.config.apiOrigin` | 你的 HTTPS API 根地址    | 完整协议和固定可信域名                         |
| `src/api.ts`                | 上游响应类型与字段映射   | 标准 `ContentEntity`、`ResourceRef`、`CrLyric` |
| `src/index.ts`              | 路径、查询参数和认证引用 | operation、权限检查、分页与错误恢复            |

如果服务使用 API Key、Cookie 或刷新令牌，不要写进 Manifest、ref、日志或普通共享 Storage。使用宿主凭据能力，并让播放 URL 尽量短期有效。公开互联网服务优先使用 HTTPS。

## 发布前检查

```text
□ 我有权访问并分发这个音乐服务的结果
□ 搜索结果不含上游完整响应和秘密字段
□ ResourceRef 能辨认当前插件、Provider 与连接
□ 空结果、401、404、429、超时和取消都有明确行为
□ 音质顺序与 Manifest 声明一致
□ 时间统一为毫秒
□ npm run typecheck / build / validate 全部通过
```

HTTP 工作台与桌面的超时、请求体、响应体限制不同，正式接入前核对 [HTTP 限额表](../http#当前资源限制)。

## 小练习

在 mock 数据中添加第四首歌，并让 `/v1/tracks` 支持按专辑搜索。无需修改 Provider，因为它只依赖 API 响应契约。

**完成标志：** 新歌曲能搜索、播放、显示歌词，构建后的 `dist/plugin.js` 也有相同行为。

项目源码：[下载完成版](/plugins/v2/tutorial/ceru-http-source.zip) · <a href="/plugins/v2/tutorial/http-source/README.md">查看目录</a>

接下来可以学习带登录与独立界面的项目：[开发 Navidrome 插件 →](../tutorial-navidrome/)
