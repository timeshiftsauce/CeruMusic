# Navidrome Vue 教程工程

这是澜音插件 v2“开发 Navidrome 插件”教程的完成版。它带有插件自己的 Vue 连接页、30 秒连接轮询、隔离存储、搜索、播放和同步歌词。

1. `npm install`
2. 终端 A：`npm run mock`
3. 终端 B：`npm run dev`
4. 打开连接页，地址保留 `http://127.0.0.1:4533`，用户名和密码都填 `demo`。
5. 搜索 `Morning`，测试播放和歌词。
6. `npm run typecheck && npm run build && npm run validate`

核心代码按职责拆在 `model.ts`、`api.ts`、`provider.ts` 和 `index.ts` 中。模拟服务只用于教程。连接真实服务器时应使用 HTTPS，且不要把密码、盐或令牌写入日志。
