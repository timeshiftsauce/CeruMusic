---
pageClass: plugin-v2-doc
title: 安装与更换服务
prev:
  text: 播放与歌词
  link: /guide/plugins/v2/tutorial-source/playback
next:
  text: 开发 Navidrome 插件
  link: /guide/plugins/v2/tutorial-navidrome/
---

# 4. 安装与更换服务

这一节把同一个工程构建成单文件插件，检查它在成品工作台和澜音中的行为。先保留本机服务，确认整条流程可用后再换自己的 API。

## 构建和预览成品

在工程根目录执行：

```shell
npm run typecheck
npm run build
npm run validate
```

看到 Valid Ceru v2 artifact 后，产物是 **dist/plugin.js**。先用 Ctrl+C 停止之前的插件 dev 服务，保留模拟服务，再执行：

```shell
npm run preview
```

这次工作台加载构建文件。重新授予所需权限，搜索 Morning 并点击“调用解析”，再执行 source.test 查看分页与歌词，应与上一节一致。

若源码修改后成品没有变化，需要重新 build；preview 不会替你把源码构建成新成品。

## 安装到澜音 2.0

桌面步骤需要**澜音 2.0** 的开发构建或正式版本。1.14.1 使用 v1，不能安装本教程的插件。

1. 保持本机 mock 服务运行。
2. 进入澜音的**设置 → 插件管理 → 添加插件 → 本地导入**，选择 dist/plugin.js。
3. 在“本地 HTTP 音源”中点击**使用**，按提示授予网络访问权限。
4. 进入搜索页，选择“本地 HTTP 音源”，搜索 Morning。
5. 播放 Morning Light，打开歌词界面，检查两行歌词。

工作台与澜音的授权各自保存，工作台已授予不代表桌面已授予。本插件没有配置抽屉，搜索页就是它的使用入口。

**这里交付的 plugin.js 不包含模拟服务。** 它仍访问本机 43120 端口，停止 mock 后就不能搜索或播放。把这个文件发送给别人，也不会自动在对方电脑上启动服务。

| 现象                   | 检查                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| 搜索没有本地 HTTP 音源 | 是否已启用插件、安装了本节重新构建的文件                           |
| 搜索提示权限错误       | 桌面是否授予 HTTP 和本机网络两项权限                               |
| 解析成功但没有声音     | 直接打开播放 URL，检查 mock 服务和音量；解析成功不等于音频请求成功 |
| 工作台能搜索，桌面失败 | 检查桌面授权，确认运行 mock 与澜音的是同一台电脑                   |
| 歌词一闪而过           | 演示音仅 2.2 秒，可在工作台查看完整歌词返回值                      |

## 换成自己的服务

完成本机练习后，按以下顺序更换。这里只说明修改位置，具体字段取决于你有权访问的 API。

接入常见平台时，可以采用[平台与音质的推荐命名](../source-conventions)，例如 QQ 音乐用 tx、网易云音乐用 wy。这些约定不强制，也不要求声明所有推荐音质。

| 文件             | 修改内容                                                                |
| ---------------- | ----------------------------------------------------------------------- |
| ceru.plugin.json | 把 manifest.config.apiOrigin 换成服务根地址；音质声明与服务实际能力一致 |
| src/network.ts   | 确认 baseURL 的路径前缀，本例固定使用 /v1/；调整本机权限检查            |
| src/api.ts       | 修改 ApiTrack、SearchResponse 和 toTrack，映射上游字段                  |
| src/catalog.ts   | 修改搜索路径、参数、分页方式和播放 URL 获取方式                         |
| src/lyrics.ts    | 转换服务的歌词格式和时间单位                                            |

如果服务完全位于公网 HTTPS 地址，删除清单中的 source.private 权限、network.ts 的 allowLocal 函数及其返回项，以及 index.ts、catalog.ts 中的 api.allowLocal 调用。保留 source.http 和 HTTP 客户端的授权检查。若服务在局域网，仍需要 network.private。

真实服务通常要求先请求接口，再取得短期播放链接，不能照搬本例的拼接路径。resolve 应返回服务给出的 URL；若同时给出了过期时间，填写 expiresAt，单位是 Unix 毫秒。需要额外请求头时查看[播放解析参考](../providers)。

先接搜索，确认歌曲字段与分页正确，再接播放和歌词。对需要登录的服务，继续阅读[连接与认证](../tutorial-navidrome/connection)，不要把 API Key、Cookie 或令牌写进清单或歌曲 ref。

## 对照工程

[下载完成版](/plugins/v2/tutorial/ceru-http-source.zip)用于检查遗漏，目录与前三节一致：

```text
ceru-http-source/
├── ceru.plugin.json
├── mock-server.mjs
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── network.ts
    ├── api.ts
    ├── catalog.ts
    └── lyrics.ts
```

解压后运行 npm install，在两个终端分别执行 node mock-server.mjs、npm run dev，即可对照正文调试。

**完成检查：** 构建后的插件能在澜音 2.0 中搜索、播放并显示歌词；同时能解释停止本机服务后为什么请求会失败。
