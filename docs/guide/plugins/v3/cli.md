---
pageClass: plugin-v3-doc
title: CLI、脚手架与调试
---

# CLI、脚手架与调试

> **适用读者**　初次使用脚手架或维护构建脚本的作者。**前置条件**　Node.js 22.12 或更新版本及 npm。**学习目标**　独立选择模板、执行命令并读懂输出。预计 8 分钟。

`create-ceru-plugin` 负责创建工程，`ceru-plugin` 负责在工程里执行检查、构建、预览和离线测试。建议从固定版本开始并提交工程自己的锁文件，团队成员随后用 `npm ci` 安装。

```sh
npx --yes create-ceru-plugin@3.0.0
npx --yes create-ceru-plugin@3.0.0 my-plugin --template page-extension --lang ts
```

第一条在交互式终端打开向导；第二条填写全部参数，可用于脚本。工程建立后，从包含 `ceru.plugin.json` 的目录运行这些命令：

| 想做什么 | 命令 |
| --- | --- |
| 查项目 CLI 和模板名 | `npx --no-install ceru-plugin --version`、`npx --no-install ceru-plugin list-templates` |
| 持续构建 | `npm run dev` |
| 对比目标宿主 | `npm run check:compat -- --host ../ceru-host.json` |
| 检查 TS/JS 工程 | `npm run typecheck` |
| 构建指定路径 | `npx --no-install ceru-plugin build --out dist/my-plugin.js` |
| 检查指定成品 | `npx --no-install ceru-plugin validate dist/my-plugin.js --json` |
| 打印桌面预览入口 | `npx --no-install ceru-plugin preview dist/my-plugin.js` |
| 用指定场景检查操作钩子 | `npx --no-install ceru-plugin test-hooks --config tests/hooks.json` |
| 对模拟服务运行消费方动作 | `npx --no-install ceru-plugin test-services --config tests/services.json` |
| 迁移 v2 工程清单副本 | `npx --no-install ceru-plugin migrate --project ../my-v2-copy` |

表里 `npm run` 使用新模板自带的脚本。需要在父目录操作时，可通过 `--project` 指定工程的命令包括 `dev`、`build`、`typecheck`、`check-compat`、`migrate` 和离线测试。对成品操作的子命令则接收文件路径。

## 选择模板

每种支持 `--lang ts` 或 `--lang js`。把任意模板名替换到上面的创建命令。Vue SFC 模板中可直接编辑 `.vue`，JavaScript 工程也可用编辑器的 JSDoc 类型提示。

| 模板 | 从哪里开始改 | 运行后先验证 |
| --- | --- | --- |
| `source` | `src/index.*` 的 `tracks.search` | 搜索 Morning、Rain 或 Night，验证源的标准元数据 |
| `page-extension` | `src/Search.vue` 和 `src/index.*` | 侧栏、设置页、歌单按钮，搜索本地库或已启用音源 |
| `player-skin` | `src/` 里的歌词、封面和背景组件 | 播放页个性化中切换皮肤 |
| `playback-hook` | `src/index.*`、`tests/hooks.json` | `npm test` 覆盖允许、拦截、改写和备用解析 |
| `connected-library` | `src/index.*`、`src/settings.*` | 添加两个演示账号并切换数据 |
| `account-qrcode` | `src/index.*` 的 `loginView` | 默认弹窗、Vue 和纯 HTML 登录内容 |
| `importer` | `src/index.*` 的 `getTracks` | 在宿主导入窗口用文本创建演示歌单 |
| `guest-adapter` | 逻辑入口及 Guest bootstrap | 按模板 README 准备父插件和要导入的格式 |
| `web-surface` | Web 视图的 DOM 入口 | 隔离页面挂载，打开与关闭 |
| `vue` / `vue-tsx` / `react` | 模板界面和 Logic 动作 | 通过 Web Surface 点按钮调用逻辑 |
| `web-dist` | 先构建独立网页，再配置 `webDist` | 现成 HTML/CSS/JS 能被嵌入 |
| `encrypted-source` | `src/demo.*`、测试及资源 | 按模板用自带离线数据运行测试 |

如果打算**复用软件已有的 Vue、TDesign 和宿主组件**，从 `page-extension` 入手。选 `vue` 模板会得到独立的 Web 视图。两种运行方式见[视图指南](./views)。

## 遇到问题先查哪一层

1. **终端没生成文件**。确认当前目录、Node 版本、依赖安装时间和第一条构建错误。TS 缺少 `@ceru/plugin-config` 时，先执行项目的 `typecheck` 或 `dev` 生成类型。
2. **产物有效但桌面不认**。查看桌面版本，确认加载的是本项目生成的成品，开发者模式中使用的是当前绝对路径。
3. **列表有插件但页面不见**。检查启用状态、挂载点、页面显隐条件和 view ID。侧栏更换图标时检查资源 ID。
4. **页面出来但动作失败**。用日志记录动作名和必要的步骤，不记录账号或凭据。查看清单声明、实际注册、UI 调用的三处动作 ID，以及对应权限的键和范围。
5. **保存后桌面没变**。确认终端有一次新的成功构建。若依赖刚换过，重启监听；若改了插件 ID，检查旧预览并重新添加。
6. **离线场景通过但真实宿主没触发**。确认从文档定义的用户入口触发、宿主权限已授予、操作钩子未在管理设置中暂停，详见 [Hook 调试](./hooks)。

需要无网工作时，可从[工具链 v3.0.0 Release](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/releases/tag/v3.0.0)取对应开发套件，依照套件 README 使用 `npm run create -- ../my-plugin --template page-extension --lang ts`。

## 自测：从一个干净目录交付文件

用页面开头的第二条命令建好 `my-plugin` 后按顺序运行：

```sh
cd my-plugin
npm install
npx --no-install ceru-plugin --version
npm run typecheck
npm run build
npm run validate
```

第一项版本检查应显示项目使用的 CLI。类型检查只验证工程；构建成功后才到 `dist` 找产物，最后一次校验应识别 `manifestVersion: 3`。再改一句页面文案直接运行 `validate`，你检查的仍是上一次生成的文件。真正要验证新改动，需要重跑构建或保持 `dev` 监听。这个区别可以解释“校验通过，桌面却还是老页面”的常见现象。
