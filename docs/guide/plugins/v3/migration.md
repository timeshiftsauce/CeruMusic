---
pageClass: plugin-v3-doc
title: 版本兼容、v2 迁移与升级验收
---

# 版本兼容、v2 迁移与升级验收

> **适用读者**　同时维护 v2 与 v3 的作者。**前置条件**　有旧源码、旧成品和测试数据备份。**学习目标**　在副本迁移并验证覆盖升级与恢复。预计 15 分钟。

| 目标桌面 | 能安装的插件 | 推荐工具链 |
| --- | --- | --- |
| 澜音 1.14.1 等历史版本 | v1 | [v1 历史文档](/guide/CeruMusicPluginDev) |
| 澜音 2.0–2.4 系列 | v2 | `create-ceru-plugin@0.3.16`，另有 `legacy-v2` npm 标签 |
| 支持双运行时的澜音 2.5.0 | v2 和 v3 | 新 v3 工程用 `create-ceru-plugin@3.0.0` |

npm 的 v3 工具链已发布。桌面 2.5.0 正式版暂未发布。需要桌面联调时请使用支持 v3 的测试构建，并按实际宿主的版本信息核对。能装 v2 成品不要求作者先迁移源码；当需要宿主组件、v3 账号或操作 Hook 时，再按下文迁移。

## 先在工程副本迁移

1. 提交或备份旧项目，在副本或新分支上操作。保留已交付的 v2 成品和旧用户的更新地址。
2. 在已有 v3 工程目录（如本教程的计数器）运行：

   ```sh
   npx --no-install ceru-plugin migrate --project ../my-v2-copy
   ```

3. 查看修改的 `ceru.plugin.json`。在迁移副本中把 CLI/SDK 和项目里用到的其它 Ceru 作者工具升级到匹配的 v3 版本，重新安装并同步锁文件。
4. 修正 Logic、权限、Provider 类型和视图引用。在副本根目录执行 `npx --no-install ceru-plugin typecheck`、`check-compat`、`build`，然后校验 `dist/plugin.js`。

迁移命令只改工程清单。有 `schema` 视图或旧 `accountItems` 时，它会提示需要人工处理并保留清单。可先用 v3 新模板写出对应 `native` / `component` / `web` 或 `provides.accounts`，再移入真实业务。成品显示的 `sourceFormat: "exports-v2"` 是文件容器的名称，判断 v3 时看 **`manifestVersion: 3`**。

## 对照改动

| v2 | v3 |
| --- | --- |
| `modules.logic/share/surfaces` | `entry.logic/share/views`；用 `module` 指向入口 |
| `contributes.commands` | `provides.actions`；原 `action` 值成为新 ID，同步菜单和调用 |
| `contributes.providers/playlistImporters/lyricConverters/guestAdapters` | `provides.providers/importers/lyricConverters/guestAdapters` |
| 顶层 `permissions` | `uses.permissions` |
| 侧栏、设置、歌单区块和自定义首页 | `ui.pages` 对应 `sidebar`、`settings`、`playlist-section` 和 `home-tab`；标准首页歌单和榜单使用 `ui.homeSections` |
| 旧版扩展点、菜单、样式 | `ui.slots/menus/styles` |
| 旧 provider 顶层 `search`、`resolve`、`lyrics`（若仍在使用） | `tracks.search/resolve/lyrics`。已分组的 v2 Provider 检查类型和资源引用即可。 |
| Schema UI、旧账号菜单 | 按使用场景重写视图与[账号入口](./accounts) |

## 用旧数据走一遍覆盖升级

在独立桌面配置中先安装旧成品，保存典型配置、授权、插件数据和可选的 Guest，再安装保持同一 Manifest ID 的新成品。确认原有状态可读取、旧 key 可迁移、新的权限变化会请求用户确认。分别复验撤权、禁用、卸载以及重启。需要同时服务两个宿主版本时，保留独立 v2/v3 下载，并在用户主动更新时按宿主版本提供对应地址。

若 v3 插件仅使用新增的公共 API，尽量保持宿主版本范围精确，回退时用已保留的 v2 成品和备份的生产配置。详细自动转换字段与按宿主版本选择更新地址的方案见 [v3 迁移规范](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/docs/MANIFEST-V3.md#从-v2-迁移)。

## 发现问题后恢复到可用状态

保留三样东西：旧成品、包含依赖锁文件的旧工程、升级前独立测试配置的完整备份。先在副本停止预览并退出桌面，避免正在运行的进程再次写入，然后按原备份方式恢复测试配置并启动原兼容版本。核对同一插件 ID、旧设置和已保存的数据，再重现一次原来可用的操作。若旧版读不懂新版已写入的数据，恢复升级前备份；继续用旧版读取已改变的生产数据可能导致覆盖。

排查时记录成品 `manifestVersion`、插件自己的 `version`、宿主版本和 CLI 版本。对于旧版 schema 视图和账号菜单，先在新模板实现最小可用页面，再迁入原业务；用[原生视图](./native)、[隔离 HTML](./web)与[账号连接](./accounts)分别验证。
