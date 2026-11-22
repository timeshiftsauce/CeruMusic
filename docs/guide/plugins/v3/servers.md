---
pageClass: plugin-v3-doc
title: 本机服务与媒体流
---

# 本机服务与媒体流

> **适用读者**　需要提供本机音频的作者。**前置条件**　已完成开发预览，能授权本机服务。**学习目标**　从健康检查到支持跳播的媒体流。预计 12 分钟。

当播放器需要读取插件按需生成的音频时，可以从沙箱开启本机服务。先用一个能在浏览器打开的健康检查验证授权和端口，再接媒体流。

## 1. 提供一个本机检查地址

在工程的 `manifest.uses.permissions` 增加一项：

```json
{ "key": "local-audio", "name": "network.serve", "reason": "在本机提供音频预览和服务状态检查" }
```

在已获得该权限的 Logic 入口中启动服务：

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin(async ctx => {
  const server = await ctx.server.serve(request => {
    const path = new URL(request.url).pathname
    return path === '/health'
      ? new Response('ok', { headers: { 'content-type': 'text/plain' } })
      : new Response(null, { status: 404 })
  }, { permissionKey: 'local-audio' })
  ctx.log.info('打开本机检查地址', { url: new URL('/health', server.url).href })
  ctx.effects.add(() => server.close())
})
```

在桌面触发该 Logic 的激活条件，从插件日志复制地址。浏览器访问应看到 `ok`；停用插件后刷新应连接失败。端口由宿主分配，每次启动读取返回的 `url`。每个插件同时可开一个服务，多个路径写在同一处理函数里。需要其他设备接入时另外声明并获准 `network.serve.lan`，启动选项传 `lan: true`，设备使用电脑的局域网 IP 和实际端口。向局域网提供私人资源时，还需在业务处理函数中校验访问授权。

## 2. 播放模板自带的三秒音频

```sh
npx --yes create-ceru-plugin@3.0.0 stream-demo --template encrypted-source --lang ts
cd stream-demo
npm install
npm run typecheck
npm run build
npm run validate
```

加载产物，选择模板的演示音源。三种 Provider 使用本机生成的 WAV，分别演示内置流处理、WASM 变换和本机 HTTP 播放。从本机服务版本开始，播放后拖动进度，检查新的区间是否有声音。实现自己的媒体路由时应处理 `GET`、`HEAD` 和 `Range`；区间响应返回 `206`、正确的 `Content-Range` 及响应长度。播放器需要能通过返回地址找到本插件登记的服务。

## 3. 选择在哪一层变换音频

- 已有可播放媒体时可直接提供它的访问地址；只有需要本机计算时才引入额外处理。
- 自定义流处理经 `ctx.streams.registerTransform` 注册，音源返回相应的 `stream.transform`。在清单声明 `streams.transform`，仅对能正确处理随机偏移的实现开启 seek。
- 模板通过 `ctx.wasm.instantiate(resourceId)` 加载清单资源，模块应随插件一起构建。停用、撤权或用户换歌时，结束处理并释放在途资源。

使用 Express、Koa 或 Node-API 模块时，需要独立的 Node 服务入口和单独的完全信任授权。普通 Web 请求见[HTTP 与实时连接](./network)，需要 Node 入口的配置、平台资源与签名步骤见[服务端开发参考](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/docs/SERVER-AND-STREAMS.md)。

## 检查端口和跳播

保持插件运行，用实际日志中的 URL 访问 `/health`，只应返回 `ok`。请求同一服务的未知路径，检查状态为 404。停用后重新访问旧地址，应连接失败。重启插件后重新复制 URL，即使这次系统分配了不同端口，也应再次得到 `ok`。

媒体路由验证时先读取整首样音，再拖动进度测试局部读取；健康检查成功只能证明监听和授权正常。只有本机能访问时，先确认测试设备地址、端口与防火墙，再核对是否获准 LAN。切换 LAN 范围前告知用户哪些设备可以访问；提供私人媒体时在业务路由校验授权。
