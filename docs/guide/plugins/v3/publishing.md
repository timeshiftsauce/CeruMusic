---
pageClass: plugin-v3-doc
title: 3. 构建、校验并安装
---

# 3. 构建、校验并安装

> **适用读者**　准备交付或更新插件的作者。**前置条件**　已跑通开发预览，备有独立测试配置。**学习目标**　用普通安装验证同一成品与升级数据。预计 10 分钟。

<PluginDiagram src="/plugins/v3/diagrams/delivery.svg" alt="从源码修改到普通安装，作者工程、成品校验、同 ID 更新" />

在计数器工程根目录按 Ctrl+C 停止 `dev`，再依次运行：

```sh
npm run check:compat
npm run typecheck
npm run build
npm run validate
npm run preview
```

| 命令 | 验证什么 |
| --- | --- |
| `check:compat` | 声明的宿主协议、运行时、组件库范围和区域。可传入目标桌面的兼容配置。 |
| `typecheck` | 清单、配置与 TypeScript/Vue 编译类型。 |
| `build` | 完整检查后编译出 `dist/plugin.js`。 |
| `validate` | 成品格式、清单、模块、资源和签名状态。 |
| `preview` | 校验成品并提示真实桌面开发预览的路径。 |

拿到目标桌面的 `ceru-host.json` 时，运行 `npm run check:compat -- --host ../ceru-host.json --json`。无此文件时，默认结果只针对 CLI 内置参考运行时。需要确认实际页面、媒体、账号或权限时，在目标桌面复验。

## 用普通插件管理试装

1. 在测试桌面移除或暂停计数器的开发预览记录，避免同时运行同 ID 的开发实例。
2. 返回「设置 → 插件管理」，点「添加插件」并选本地文件，或将本次生成的 `dist/plugin.js` 拖入窗口。检查插件信息，然后点击「使用」或启用。
3. 从侧栏打开「练习计数器」。普通安装使用其实际存储空间，首次计数无需与开发预览一致。记录初始值，点一次「加一」，关闭桌面再打开，确认增加后的值保留。
4. 做升级测试时保留插件 ID，增加清单版本号，重新构建并更新安装。检查状态、已有许可与功能在新版本中的表现；扩大权限范围后应检查授权提示。

## 把文件交给使用者

只分发由 CLI 生成的单文件，例如命名为 `ceru-counter-0.1.0.js`。发布说明应写清桌面版本要求、插件 ID、已测试的环境、用途、权限原因和安装入口。可同时提供 SHA-256。若向社区投稿，按[模板仓库投稿流程](https://github.com/CeruMusic/CeruMusic-Plugin-Template/blob/main/CONTRIBUTING.md)准备 `plugin.json`、说明和下载记录。

工程源码可以另开仓库维护。敏感值、实测账号数据、私钥和个性化发行文件不适合放入公开源码或公共产物。运行配置位于单文件中，任何已分发的默认值都可被读到。

## 可选：签名和验签

在项目目录运行（密钥目录加入 Git 忽略，生产密钥应在受控位置保存）：

```sh
npx --no-install ceru-plugin keygen --out .keys/publisher
npx --no-install ceru-plugin sign dist/plugin.js --key .keys/publisher.private.pem --out dist/plugin-signed.js
npx --no-install ceru-plugin validate dist/plugin-signed.js --trusted-key .keys/publisher.public.pem --json
```

给用户提供与签名对应的公钥或可独立核对的公钥指纹。签名用于验证来源和完整性。安装时，用户仍会按宿主规则查看实际权限。制作客户专用文件时再使用 `template`、`issue` 或 [Issuer API](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/packages/issuer/README.md)，让发行端保管私钥。

接下来可以试做[能搜索和播放的插件页面](./music)，或者对照 [CLI 和模板表](./cli)选择新项目。

## 记录一次可复验的交付

| 保存的记录 | 例子 | 复验方式 |
| --- | --- | --- |
| 清单身份 | 插件 ID、清单版本、插件版本 | 与成品校验 JSON 比较 |
| 生成环境 | CLI / SDK 和桌面版本、锁文件 | 在另一个干净工程目录重新安装依赖并构建 |
| 成品 | 实际分发的 JS 文件和摘要 | 对下载副本运行 validate，签名发行时同时核对公钥 |
| 升级结果 | 旧版本、旧计数与新版本首次读取值 | 同 ID 更新后再重启桌面，验证设置和授权 |

“开发者模式可用”只能证明当前开发预览可运行。交付前应移除预览再使用普通安装完成相同步骤；若发现严重问题，让测试用户使用原有成品和备份数据恢复，再排查升级读写逻辑。[迁移与恢复](./migration)
