# 账号与原生歌单教程

这是澜音插件 v2 文档的可运行完成版。它演示：

- `accountItems` 账号菜单与 `AccountSummary`
- Vue modal、`SurfaceContext.invoke/subscribe/close`
- `ctx.ui.setState/closeView`
- `defineNativeView`、原生歌单网格和歌曲列表
- `contributes.playlistSections` 将个人歌单放入澜音现有“歌单”页
- `Provider.playlists.get` 分页与 `tracks.resolve`
- 原生详情、播放队列、播放器和歌单导入

登录流程完全是本地模拟，不会连接网易云或其他真实平台。项目仅用来学习通用插件 API。

它不会增加侧边栏按钮，也不会用抽屉承载个人歌单；启用后请在澜音现有侧边栏“歌单”页查看插件区块。Web Surface 会按内容自动调整高度。

```shell
npm ci
npm run mock
```

另开一个终端：

```shell
npm run typecheck
npm run dev
```

构建与校验：

```shell
npm run build
npm run validate
npm run preview
```

正式插件应把 `account.start/poll` 中的模拟逻辑换成你有权调用的平台接口，并通过 `ctx.http.request` 使用已声明的网络权限。Cookie、刷新令牌和会员接口原始响应不得放入 `AccountSummary`、Surface state、`ResourceRef.data` 或日志。
