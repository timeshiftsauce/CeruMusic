---
pageClass: plugin-v2-doc
title: 验证并安装 Navidrome 插件
description: 用模拟服务验证完成版，再切换真实 Navidrome 并安装到澜音。
prev:
  text: Navidrome Provider
  link: /guide/plugins/v2/tutorial-navidrome/provider
next:
  text: Provider API
  link: /guide/plugins/v2/providers
---

# 验证并安装 Navidrome 插件

## 先完成可重复验证

在模拟服务运行时执行：

```shell
npm run typecheck
npm run build
npm run validate
npm run preview
```

检查以下行为：

```text
□ demo / demo 能登录，错误密码会显示认证错误
□ 登录成功后密码框被清空
□ 未勾选“记住登录”时，重启工作台不会恢复连接
□ 勾选后重启会恢复服务器和用户名，不显示密码或 token
□ 断开会删除保存的连接
□ Morning 能搜索、播放并显示歌词
□ 页面关闭后不再发起 30 秒 ping
```

构建产物应显示两个模块：

```text
logic.main
view.connection
```

这证明后台逻辑和 Vue Surface 都进入同一个 `dist/plugin.js`。

## 切换到真实 Navidrome

停止 `npm run mock`。重新打开连接页，填写你的服务器地址和账号。

地址可以包含反向代理子路径，例如：

```text
https://music.example.com/navidrome
```

不要填写 `/rest/ping.view`，插件会自行拼接 `/rest/<endpoint>.view`。地址中也不要包含用户名、密码或查询参数。

| 场景       | 建议                                           |
| ---------- | ---------------------------------------------- |
| 公网服务器 | 使用有效 HTTPS 证书，只授予网络请求            |
| 同一台电脑 | 使用 `http://127.0.0.1:4533`，额外授予私网权限 |
| 家庭 NAS   | 使用局域网 IP 或本地域名，额外授予私网权限     |
| 反向代理   | 确认子路径和 `/rest/` 路由未被重写掉           |

## 安装到澜音

`npm run build` 后，在澜音 **1.14.1+** 的设置 → 插件管理 → 添加插件 → 本地导入，选择 `dist/plugin.js`。启用后从插件的配置入口打开连接抽屉。

第一次连接会请求权限。拒绝后插件不能自行绕过；到插件权限页重新授权，再点击测试连接。

## 生产版本还要补什么？

- 给 401/403、404、429、超时和取消映射准确的 `MusicFault`。
- 对歌单和专辑使用真正的分页，不在 ref 中保存整份响应。
- 封面 URL 可能携带认证参数；公开分享前评估泄露风险。
- 添加连接迁移版本，旧记录解析失败时安全清除。
- 使用模拟 API 做自动测试，再用自己的服务器做一次手工测试。

完整项目：[下载教程工程](/plugins/v2/tutorial/ceru-navidrome-vue.zip) · <a href="/plugins/v2/tutorial/navidrome-vue/README.md">查看 README</a>

社区完整插件：[ceru.navidrome](https://github.com/CeruMusic/CeruMusic-Plugin-Template/tree/main/plugins/ceru.navidrome)。它包含歌单、专辑、收藏、导入和歌词导出，可作为下一阶段参考。
