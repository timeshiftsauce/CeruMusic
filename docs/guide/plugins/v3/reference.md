---
pageClass: plugin-v3-doc
title: SDK 类型与方法签名
---

# SDK 类型与方法签名

> **适用读者**　按接口名查类型的作者。**前置条件**　使用 SDK 3.0.0。**学习目标**　定位声明及其关联的可运行教程。预计 5 分钟。

在编辑器里按接口名跳转，或在下面展开声明。内容由本站构建时读取的官方 SDK 3.0.0 类型文件生成。声明中的相对导入属于 SDK 内部；插件源码从包名或文档示例指定的公开子入口导入。

第一次写插件，请先做[计数器练习](./first-plugin)。查到 `permissionKey` 后看[权限申请](./permissions)，查到 `OperationContext` 后看[操作钩子](./hooks)。展开的代码可以搜索、选择和复制。

按方法名找参数、返回值和对应教程可用[方法索引](./methods)。以下类型文件保留 SDK 原始声明及废弃标记。

## 入口、清单与数据 {#logic}

::: details PluginContext、ResourceRef、OperationContext 和注册入口
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/index.d.ts{ts}
:::

::: details 清单、入口和 JSON 类型
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/manifest.d.ts{ts}
:::

::: details 存储键和读取范围
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/storage.d.ts{ts}
:::

::: details 权限与权限组
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/permissions.d.ts{ts}
:::

::: details 生命周期和清理
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/lifecycle.d.ts{ts}
:::

::: details 路由和守卫
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/navigation.d.ts{ts}
:::

## 音乐、歌词与账号 {#music}

::: details 聚合音源与播放调用
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/music-api.d.ts{ts}
:::

::: details 歌曲、歌单与 CrLyric
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/music.d.ts{ts}
:::

::: details 比较和选择音质
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/quality.d.ts{ts}
:::

::: details 歌词格式、解析与导出
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/lyrics.d.ts{ts}
:::

::: details 曲库与歌单导入器
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/library.d.ts{ts}
:::

::: details 账号、登录与凭据
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/accounts.d.ts{ts}
:::

## 界面与播放区域 {#views}

::: details Vue hooks 和组件挂载
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/vue/index.d.ts{ts}
:::

::: details 宿主组件、界面桥接与弹窗
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/view-contracts.d.ts{ts}
:::

::: details 原生视图与动作
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/native-view.d.ts{ts}
:::

::: details 播放器区域与上下文
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/regions.d.ts{ts}
:::

::: details 区域组件快捷入口
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/vue/region.d.ts{ts}
:::

## 操作、事件与服务 {#hooks}

::: details 可拦截操作、输入与结果
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/hooks.d.ts{ts}
:::

::: details 可订阅事件
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/events.d.ts{ts}
:::

::: details HostServices 宿主接口
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/services.d.ts{ts}
:::

::: details 跨插件服务调用
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/plugins-api.d.ts{ts}
:::

::: details Guest 管理、协议与启动
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/guests.d.ts{ts}
:::

::: details 分享与导入
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/share.d.ts{ts}
:::

## 网络、资源与媒体流 {#transport}

::: details HTTP 客户端、查询和响应
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/http.d.ts{ts}
:::

::: details WebSocket 与 Socket.IO
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/sockets.d.ts{ts}
:::

::: details 服务入口与监听句柄
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/server.d.ts{ts}
:::

::: details 媒体流与变换
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/streams.d.ts{ts}
:::

::: details WebAssembly 资源
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/wasm.d.ts{ts}
:::

::: details 加解密流
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/crypto-streams.d.ts{ts}
:::

::: details 图标与资源目录
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/catalog.d.ts{ts}
:::

::: details 模块映射
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/modules.d.ts{ts}
:::

## 兼容工具与校验方法 {#helpers}

::: details 旧 HTTP 帮助函数
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/legacy-http.d.ts{ts}
:::

::: details 公开链接
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/links.d.ts{ts}
:::

::: details 校验资源与查询参数
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/validate.d.ts{ts}
:::

::: details 视图桥接导出
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/view-bridge.d.ts{ts}
:::

::: details 兼容加密工具
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/compat/crypto.d.ts{ts}
:::

::: details 编码工具
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/compat/encoding.d.ts{ts}
:::

::: details 格式化工具
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/compat/format.d.ts{ts}
:::

::: details 压缩工具
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/compat/zlib.d.ts{ts}
:::

::: details Logic 的宿主模块别名（ceru、@ceru/http 等）
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/dist/host-modules.d.cts{ts}
:::

::: details SDK 许可证
<<< @/../node_modules/@shiqianjiang/ceru-plugin-sdk/LICENSE{text}
:::

## 从一个返回值读到下一步

例如歌单列表的返回类型含有分页对象，先查 `library` 或 `music` 方法的返回类型，再展开 `Page<T>` 和 `MusicPlaylist`。只把标题等展示字段送给 View，保留原始 `ref` 作为打开歌单的依据。遇到 `@deprecated` 应回到对应新类型，例如写新歌词接口时使用 `CrLyric`。v2 清单与运行时的实际可用方法请按[v2 文档](/guide/plugins/v2/)和[迁移对照](./migration)核对。
