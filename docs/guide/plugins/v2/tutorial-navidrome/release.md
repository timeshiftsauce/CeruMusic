---
pageClass: plugin-v2-doc
title: 5. 验证并安装
description: 用模拟服务检查完整链路，再连接真实 Navidrome 并安装到澜音 2.0。
prev:
  text: 搜索、播放与歌词
  link: /guide/plugins/v2/tutorial-navidrome/provider
next:
  text: Provider API
  link: /guide/plugins/v2/providers
---

# 5. 验证并安装

这一节不再改源码。先用模拟服务逐项验证，再切换到真实服务器和澜音 2.0。

## 1. 完成构建检查

保持 `npm run mock` 运行，在插件工程执行：

```shell
npm run typecheck
npm run build
npm run validate
npm run preview
```

产物应包含两个入口：

```text
logic.main
view.connection
```

这表示后台逻辑和 Vue 页面都已进入 `dist/plugin.js`。

## 2. 检查连接生命周期

在工作台按顺序验证：

1. 用错误密码登录，应显示认证错误且不会变成已连接；
2. 用 `demo / demo` 登录，密码框应立即清空；
3. 不勾选“记住登录”，重启工作台后不应恢复连接；
4. 勾选后重新登录并重启，应恢复服务器和用户名，不显示密码、token 或 salt；
5. 点击“断开”再重启，不应恢复连接；
6. 页面关闭后等待 30 秒，模拟服务不应再收到页面轮询。

这里分别验证了三种状态：`invoke` 的本次结果、`subscribe` 收到的页面公开状态，以及 Storage 中的跨重启连接。三者不能互相替代。

## 3. 检查音乐链路

重新连接后检查：

```text
□ Morning 能搜索到一首歌
□ 不存在的关键词返回空列表
□ original 能解析并实际播放 WAV
□ 128k 和 320k 会生成对应转码参数
□ 歌词包含两行且时间顺序正确
□ 断开后旧歌曲不能继续解析
```

模拟服务只生成测试音频。解析返回 URL 还不等于播放成功，播放器必须真正读取到带有 `RIFF` / `WAVE` 头且包含音频采样的数据。

## 4. 连接真实 Navidrome

停止 `npm run mock`，重新打开连接页并填写自己的服务器。地址可以包含反向代理子路径：

```text
https://music.example.com/navidrome
```

不要填写 `/rest/ping.view`，插件会自行拼接 `/rest/<endpoint>.view`。地址也不能包含用户名、密码或查询参数。

| 场景 | 填写与授权 |
| --- | --- |
| 公网服务器 | 使用有效 HTTPS 地址，允许网络请求 |
| 同一台电脑 | 使用 `http://127.0.0.1:4533`，同时允许私网访问 |
| 家庭 NAS | 使用局域网 IP 或本地域名，同时允许私网访问 |
| 反向代理 | 保留部署子路径，确认 `/rest/` 路由可用 |

公网服务器应使用 HTTPS。Subsonic 播放 URL 含认证参数，不要记录、分享或长期保存完整 URL。

## 5. 安装到澜音 2.0

执行 `npm run build`，然后在澜音 2.0 打开“设置 → 插件管理 → 添加插件 → 本地导入”，选择 `dist/plugin.js`。启用后，从插件的“Navidrome 连接”配置入口打开连接页。

第一次连接会请求网络权限。拒绝后，插件不能绕过权限；需要在插件权限页重新允许，再点击“测试连接”。

完成版工程可用于最终对照：[下载 Navidrome 教程工程](/plugins/v2/tutorial/ceru-navidrome-vue.zip)。正文已经逐步建立其中每个核心文件，下载包不是完成教程的前置条件。

## 常见问题

**真实服务器返回 Subsonic 错误**

先用浏览器或 Navidrome 客户端确认地址和账号。反向代理要保留部署子路径和 `/rest/` 路由。

**本机能连接，安装后不能连接 NAS**

确认授予了 `navidrome.private`，并检查系统防火墙和 NAS 监听地址。

**搜索正常但转码播放失败**

先测试 `original`。`128k` 和 `320k` 依赖服务器转码配置，真实服务器可能缺少 ffmpeg 或禁用了转码。

**想继续实现歌单、专辑和收藏**

先保留本教程的连接与 ref 归属检查，再按 Provider 协议逐项增加能力。每个列表都应实现分页，不要把整份服务器响应放进歌曲 ref。
