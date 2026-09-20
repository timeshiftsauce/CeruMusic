---
pageClass: plugin-v2-doc
---

# 从插件 v1 迁移

插件 v2 是新的运行和数据契约。保留 .js 扩展名并不意味着与 v1 二进制兼容；也不能只把版本号改成 2。

旧文档仍在：[v1 插件开发](/guide/CeruMusicPluginDev)、[旧 Host 类](/guide/CeruMusicPluginHost)。

## 接口迁移对照

| v1 写法 / 假设                       | v2 对应                                               |
| ------------------------------------ | ----------------------------------------------------- |
| 注释与 pluginInfo 提供信息           | 静态 exports.manifest，manifestVersion:2              |
| musicUrl(source, musicInfo, quality) | 分组 Provider tracks.resolve(ref, quality, operation) |
| 直接返回 URL 字符串                  | ResolveResult：ok:true/url 或 ok:false/error          |
| musicInfo.id/songmid/hash 混用       | 稳定 ResourceRef，id 为字符串                         |
| getLyric 返回平台歌词                | tracks.lyrics 返回 CrLyric                            |
| 固定平台音质名单                     | Provider 自己声明从低到高的 qualities                 |
| cerumusic.request / LX 回调          | ctx.http.create 与 OperationContext                   |
| NoticeCenter                         | ui.notify/toast；更新用 ui.pluginUpdate.request       |
| 旧脚本全局与平台源注册               | definePlugin + Manifest 贡献 + 注册表                 |
| 宿主全局直接拿 UI 或库               | Web Surface 隔离页面、Action 通信、受支持内建模块     |
| 原安装器直接导入 LX                  | 对应 v2 Guest 兼容环境导入                            |

## 推荐迁移顺序

1. 创建 source TS/JS 工程，先通过本地搜索演示。
2. 写稳定 Manifest ID 与 Provider 声明。
3. 将旧搜索结果转为 ContentEntity，先保证 title、ref、metadata.artists。
4. 把播放解析改成 ResolveResult，列出真实支持的音质。
5. 用 HTTP 客户端替换旧请求工具，声明权限并传递 operation。
6. 转换歌词为 CrLyric，或注册专门转换器。
7. 将偏好迁入 storage，增加原生抽屉或 Web 页面。
8. build → validate → preview → 在澜音 2.0 安装验证。

## 需要保留旧版本用户时

分别发布 v1 与 v2 成品，清楚注明适用桌面版本。给 v2 新结构维护独立工程或分支，避免一个文件同时混用两套全局 API。

Host 不会替你把任意 v1 私有数据迁移成新插件业务结构。相同插件名字不等于相同身份，迁移时确认 manifest.id、存储键和字段版本。

## 迁移后最容易遗漏的检查

- Provider、Action、Importer 的声明和注册 ID 是否一致。
- 秒是否已转换成毫秒。
- 歌词失败是否仍允许播放。
- 用户拒绝网络权限后是否能清楚退出。
- 用户自己的凭据是否被意外打入成品或共享存储。
- 桌面未接入的 SDK 方法是否被误当成替代旧接口。
