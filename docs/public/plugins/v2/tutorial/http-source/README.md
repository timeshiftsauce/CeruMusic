# 本地 HTTP 音源教程工程

这是澜音 v2 HTTP 音源教程的完成版，与连通 API、搜索与分页、播放与歌词三节的最终文件一致。桌面安装需要澜音 2.0；1.14.1 使用 v1。

需要 Node.js 22.12+。进入包含 package.json 的目录：

1. 执行 npm install。
2. 终端 A 执行 node mock-server.mjs，保持运行。
3. 终端 B 执行 npm run dev。
4. 在工作台执行 source.check，授予 HTTP 和本机网络权限，应返回三首歌。
5. 搜索 Morning，测试播放解析和歌词。三首歌共用同一段 2.2 秒合成 WAV 音频。
6. 执行 npm run typecheck、npm run build、npm run validate，成品位于 dist/plugin.js。

src/network.ts 管理 HTTP 客户端与本机权限；api.ts 转换歌曲和游标；catalog.ts 注册搜索、播放和歌词；lyrics.ts 转换歌词；index.ts 连接这些文件。

成品不包含 mock 服务，停止服务后就不能搜索或播放。工作台和桌面的授权各自保存。
