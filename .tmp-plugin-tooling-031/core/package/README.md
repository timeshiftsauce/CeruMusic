# @shiqianjiang/ceru-plugin-core

Ceru Music v2 的 Host 无关 Core。它读取单文件 artifact，校验 manifest，接收插件注册的 Provider、Action 和歌单 Importer，并在结果返回应用前执行统一的数据契约校验。

Core 提供 `./node` 纯 Node worker 运行环境、`./electron` 可见页面沙箱、`./network` HTTP 代理和 `./sockets` 连接管理。后台逻辑不依赖 DOM；可见页面单独运行。播放器、歌单、账号和授权界面由澜音现有服务提供。

0.3.1 支持 SDK 的播放 `requestHeaders` 结果校验。桌面 Host 应将这些请求头按完整临时媒体 URL 隔离保存在主进程，并同时用于播放、缓存和下载请求。

0.3.0 增加 `./surface` 的 `SurfaceSession` 与 `./surface-document` 的 `createWebSurfaceDocument`。宿主将 document 放入 `sandbox="allow-scripts"` 的 iframe，只允许 session.invoke 调用已声明动作，挂载后调用 session.open，关闭/切换时调用 session.close。状态按 surface ID 路由，并在挂载后重放。宿主必须校验消息来源、session ID，并阻止 iframe 导航及新窗口；不应实现任何平台的登录 UI 或账号流程。

`./guests` 正式导出 `GuestStore`，在独立 Node worker 中运行兼容环境提供的 bootstrap 和用户导入脚本。它保留原有 Host 边界：导入确认、网络授权、私网授权、事件及私有目录由应用提供。

Node VM 内只运行本领域的 SDK 与打包后的插件，跨边界使用 JSON，删除原生桥引用并禁用字符串代码生成；worker 设内存、运行时限和消息额度。公网请求由用户按组授权，内网另行授权。此隔离不应宣称是针对所有 V8 漏洞的安全保证。

歌词统一使用 SDK `CrLyric`（`format: 'crlyric'`、`version: 1`、毫秒时间轴）。`lyricConverters` 插件负责导入各种歌词和导出 LRC/增强 LRC/YRC；Core 不包含歌词解析器。音质顺序由 Provider 的 `qualities` 数组定义，从低到高。

```ts
const core = await PluginCore.load(bytes, {
  host: {
    activate: (artifact, context) => sandbox.run(artifact, context),
    request: (request) => hostHttp.request(request),
  },
})

await core.invokeProvider('tx', 'tracks.search', [request], operation)
await core.importPlaylist('import.tx', value, undefined, 100, operation)
```

插件仍然只需要导出 `manifest`、`activate` 和可选的 `surfaces`。Core 不要求使用 CLI。
