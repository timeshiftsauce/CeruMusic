# 本地 HTTP 音源教程工程

这是澜音插件 v2“开发 HTTP 音源插件”教程的完成版。它只访问本机模拟服务，不包含第三方平台接口。

1. `npm install`
2. 终端 A：`npm run mock`
3. 终端 B：`npm run dev`
4. 在工作台搜索 `Morning`，再测试播放和歌词。
5. `npm run typecheck && npm run build && npm run validate`

需要 Node.js 22.12+ 与完整的 0.3.5 工具链。
