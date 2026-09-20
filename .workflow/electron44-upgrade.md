# Electron 44 升级记录

## 版本与适配

- Electron 固定为 44.4.3。运行时实测为 Chromium 152.0.7977.130、Node.js 24.21.0。
- Windows 保留默认 thickFrame，并启用 roundedCorners。移除先前关闭系统边框的全屏规避方案。
- 剪贴板读取等待 Promise，以便捕获异常；插件剪贴板写入完成后才响应调用者。
- better-sqlite3 更新为 13.0.3，使用随包提供的 Node-API 原生文件，避免 Electron ABI 变更导致数据库无法加载。
- postinstall 验证 SQLite，Windows 上只准备 registry-js；不再对已带预编译文件的 SQLite 强制 node-gyp 重建。
- 移除强制降级 node-abi 的 resolution；Vite 固定到已使用的 7.1.2，避免 Yarn 1 与 vitest 的依赖链接冲突。

## 使用影响

- Windows 不再提供 32 位包；保留 x64。普通窗口的 Win11 圆角、系统边框和边缘缩放恢复。
- macOS 最低版本为 13。通知依赖代码签名；CI 保留原有签名、公证配置及 secrets。
- Linux 不再支持 Unity 专属集成。随 SQLite 提供的 Linux 原生文件引用 GLIBC_2.34，要求 glibc 2.34+（例如 Ubuntu 22.04+）；AppImage 也不能保证在更老 glibc 上运行。
- 未指定 defaultPath 的文件打开/保存对话框现在默认进入“下载”目录，不会自动记住上次目录。这不是下载完成后自动打开文件夹。
- 没有升级歌单/本地音乐库的表结构。运行测试使用独立临时用户目录，不修改真实用户数据。

## GitHub Actions

- 保留 Windows x64、macOS Intel、macOS arm64、Linux x64 四个构建任务。
- 固定 Yarn 1.22.22，使用冻结锁文件安装。
- 显式执行 install-electron，适配 Electron 42+ 不再由依赖 postinstall 自动下载运行时的变化。
- 安装后用 Electron 内置 Node 验证 SQLite 和 Windows registry-js。
- 所有平台打包后、清理 unpacked 目录前，再验证成品 app.asar 中的原生模块，失败阻止后续发布。
- 保留现有签名、公证、Release 和镜像发布流程。普通分支 push 不触发当前工作流，仍需 v\* tag 或 workflow_dispatch。
- 排除 dist、CodeGraph 索引、工作记录及日志，避免本地构建把旧安装包再次打包。

## 本地验证

- yarn install --frozen-lockfile：通过，包括 postinstall。
- yarn build：主进程和渲染端类型检查、生产构建通过。
- yarn test:electron：实际 Electron 44 应用启动、歌单增删/排序/搜索/重读、本地音乐库读写、静音 WAV 播放、WebGL2、剪贴板读取和读取失败回退通过。
- 原生窗口实测：2560×1440 内容区完整铺屏；F11 / Esc、普通窗口与最大化恢复、多次切换通过。
- Windows DWM 检查：圆角策略为 DWMWCP_ROUND（2），WS_THICKFRAME 保持启用，退出全屏后保持一致。
- node scripts/check-native-runtime.cjs：SQLite 和 registry-js 在 Electron 44 内置 Node 中加载成功。
- node scripts/check-native-runtime.cjs --packaged：Windows 成品 app.asar 内的 SQLite 和 registry-js 加载、事务和数据库完整性检查通过。
- Windows x64 NSIS 安装器、ZIP、更新 blockmap 和 latest.yml 已生成，electron-builder 退出码为 0；ZIP 经 7-Zip 完整性检查通过。产物位于 dist/electron44-check/，安装器为 ceru-music-1.14.1-win-x64-setup.exe。
- 本地打包使用已经下载并验证的 node_modules/electron/dist，工具下载临时使用 npmmirror；没有执行安装器安装，也没有在 GitHub 运行远程工作流。成品 asar 已确认不包含旧 dist 和 CodeGraph 索引。
- Jest 全量尚未通过：DownloadManager/Settings 的歌词类型与 @common 别名问题，及 update-server/scripts/test.ts 的 CommonJS/import.meta 配置冲突。生产 typecheck/build 已通过，这些 Jest 问题不属于 Electron API 迁移。
- 现有插件专项测试也未全部通过：权限测试期待中文“未授权”，实际 SDK 返回英文 permission denied；播放测试的模拟模块未覆盖 ControlAudio 新依赖。这些失败点未改动，不能据此宣称所有第三方插件播放已验证。
- macOS/Linux 实际构建与签名结果需要 GitHub 对应 runner 验证；本机是 Windows，不能把静态配置检查等同于远程构建成功。

## 上游依据

- https://github.com/electron/electron/blob/v44.4.3/docs/breaking-changes.md
- https://github.com/electron/electron/blob/v44.4.3/docs/api/clipboard.md
- https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0
