# 2.0 歌曲数据兼容与升级修复

歌曲、队列、歌单和最近播放统一保存 `MusicItem`。插件仍使用 `ContentEntity/ResourceRef` 调用协议，由宿主在调用边界转换。云端与 `.cpl/.cmpl` 文件继续交换歌曲元数据，文件外层加密、压缩方式不变。

## 用户升级

软件先只读检查旧数据，欢迎页退出后才显示软件内修复弹窗。选择“立即修复”会先备份，再迁移本地歌曲、队列、历史和歌单；不会主动修改云端存量歌单。选择“稍后”不迁移，下次启动继续提醒，设置中的“旧版音乐数据”也可重新打开检查。

备份位于用户数据目录的 `music-data-repair/<时间>/`，包含 localStorage 原文、SQLite 一致性快照和旧 JSON 歌单。完成窗口显示备份位置、处理记录数及无法恢复的项目。旧备份中可能被主动删除的歌曲会列为可选恢复项，默认不恢复。

修复保持歌单 ID、云端关联、歌曲顺序和播放进度。坏记录的原文保留在备份中；无法找到的时长或文件大小不会编造。中断后根据 `journal.json` 恢复数据库与浏览器存储，完成恢复后才重新开启写入，可以安全重试。

暂缓修复时，旧 localStorage 原文保留，新操作写入 `ceru-music-pending:` 前缀的临时数据。旧 JSON 歌单支持读取，修改前要求修复。尚未迁移的旧 SQLite 歌单可执行无歧义操作；遇到同 ID 不同来源时要求先修复。

## 本地格式

| 数据               | 持久化位置         | 内容                                                                                    |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------- |
| 当前歌曲与最近播放 | `globalPlayStatus` | `schemaVersion: 2`、`player.songInfo`、`player.songId`、`player.coverDetail`、`history` |
| 播放队列           | `songList`         | 有序 `MusicItem[]`                                                                      |
| 选择、进度和偏好   | `userInfo`         | 原字段加可选 `lastPlaySongKey`                                                          |
| 本地歌单           | `playlists.db`     | 元信息及 `(playlist_id, song_key)` 歌曲主键                                             |

`coverDetail` 只保存当前歌曲已计算出的颜色。重新打开软件立即恢复这些颜色，不等待播放、歌词或封面请求；没有颜色缓存或更换封面时再计算。评论、加载状态和临时 Blob URL 不保存。默认恢复显示与进度，不自动播放。

最近播放只由实际播放事件新增，最多 200 首，插件历史接口每页 50 首，读取时即时转换。旧键 `ceru-plugin-playback-history-v1` 仅作为迁移输入，不再写入。

```ts
interface MusicQuality {
  type: string
  size?: string // 原始展示文字，例如 '9.12 MB'
  sizeBytes?: number // 已知的真实字节数
  hash?: string
}
```

`MusicItem` 保留 `songmid/source/name/singer/albumName/albumId/interval/img/lrc`，以及可选 `hash/_types/typeUrl` 等已有有效元数据。音质输入允许字符串或对象，写入统一为 `MusicQuality[]`。

公共歌曲身份是来源和字符串化歌曲 ID。调用插件时生成 `scope: 'provider'` 引用，保存歌曲时删除这种可推导引用、历史生成的 `local.library` 公共引用和已知旧聆澜公共引用。其他插件的引用不凭平台名称删除。私有资源额外保留插件归属、连接、资源 ID 和必要数据。

内部 `song_key` 使用 `ceru-song:` 加 JSON 元组：公共歌曲为 `["public", source, id]`，私有歌曲为 `["private", pluginId, providerId, connectionId, id]`。数字和字符串 ID 等价。旧版单 ID 查询、删除只在匹配唯一时执行；存在歧义则报错。

## 云端兼容

新后端通过 `GET /user-songlist/capabilities` 返回 `songIdentity: 2`，删除支持 `songKeys`，原 `songmids` 参数继续保留。新后端接受缺失的展示元数据与音质大小，并校验私有引用。

能力接口返回 404 时，客户端按旧后端处理，上传时为未知音质大小填“未知”等兼容展示值，原本地歌曲不被这些值改写。同 ID 不同身份的冲突操作会明确要求升级后端，普通歌单继续同步。网络、认证或服务器故障不会被当成旧版能力。

## 开发与验证

共享契约：`src/common/musicItem.ts`；插件边界：`src/common/pluginMusic.ts`；纯数据修复：`src/common/musicDataMigration.ts`。后端共享同一歌曲规范化实现。SDK 的 `qualitySizeLabels` 保存展示大小，`qualitySizes` 仅表示真实字节数，`durationMs` 使用毫秒，`hash` 可选。

```sh
yarn typecheck
node scripts/test-music-data-contract.mjs
node scripts/test-music-data-database.mjs
node scripts/test-music-cloud-compat.mjs
node scripts/test-plugin-resource-routing.mjs
node scripts/test-share-comments.mjs
```

附件回归样例在 `scripts/fixtures/music-item-v1.json`，后端与 SDK/CLI 测试使用相同样例。它覆盖 `03:59`、原始音质大小及无冗余公共引用。数据库测试覆盖同 ID 来源、备份、事务与恢复；云端测试覆盖新旧能力、歧义阻止和文件往返。

当前 SDK/Core 0.3.7 尚未发布，桌面项目使用 `vendor/` 中的本地依赖包及锁文件。更新这些包时在 CLI 仓库执行 `npm run build`，再分别对 `packages/sdk`、`packages/issuer`、`packages/core` 执行 `npm pack --pack-destination <桌面项目>/vendor`，然后更新桌面依赖锁文件。不要把未发布版本替换成不可安装的 registry 依赖。

本阶段不发布软件包或部署后端。软件界面、重启与实际播放由用户自行验收；自动化界面测试脚本保留为以后可选执行，不包含在上述检查命令中。

## 本次验证结果

客户端类型检查、歌曲契约、SQLite 迁移/回滚、旧 JSON 延后修复与重复修复、云端新旧请求兼容、`.cpl/.cmpl` 文件往返、插件资源路由及分享热评收集检查已通过。后端 15 项 DTO/服务测试与类型检查通过；SDK/CLI 构建及 11 项契约测试通过；聆澜类型检查、构建和产物格式校验通过。

分享歌曲重新收集并上传 `hotComments`，最多 10 条。只复用同一歌曲身份的已有评论，分享其他歌曲或尚未加载评论时会调用评论插件；失败会明确提示。后端已有热评保存协议继续使用。

云端验证使用隔离的接口替身，未连接生产账号上传歌单或分享。旧后端若不能保存私有引用，会要求升级，避免引用被旧 DTO 丢弃。按用户要求，最终界面和实际播放测试由用户完成。
