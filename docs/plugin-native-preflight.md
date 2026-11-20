# 阶段九前置验证（Windows，本地）

下文保留早期探针结果，包括最初的 Node 入口替代原型。当前桌面实现改用 Electron `utilityProcess` 与专用 `MessagePort`。Electron 45 忽略 Node 权限参数这一结果仍然有效，因此界面明确显示“可以访问你电脑上的所有文件，也可以启动其他程序”，并要求重新确认；旧受限模式的同意不自动沿用。

`test-plugin-utility-runtime.mjs <v3 工具链目录> --asar` 已在一次性 profile 下通过：真实独立 utility 进程、RPC、HTTP、撤权取消在途调用、关闭端口、清理目录、实际 Express/Koa、Node-API 模块、崩溃清理和启动超时。测试从 ASAR 加载宿主代码并把 runner 与 `.node` 提取到 ASAR 外；读取临时兄弟文件成功也纳入验证，以确认界面所描述的无限制文件访问。此结果不代表操作系统沙箱或普通插件可以访问这些能力。桌面完整授权流程与打包产物的验证见 [本地验收](plugin-upgrade-local-qa.md)。

运行 `node scripts/check-plugin-media-prerequisites.mjs`。只使用临时 profile、生成的 WAV 和临时测试文件，不加载第三方代码，不读取用户目录中的音乐或凭据。

| Electron 45.0.0 核对项 | 结果 |
| --- | --- |
| protocol.handle 返回流式 Response | 静音音频开始播放，定位到 143 秒后播放进度继续前进；观察到从 0 和 6291456 字节开始的请求。 |
| utilityProcess.fork 的 Node 权限开关 | 两组子进程分别传入和不传入 allow-addons，均未启用 process.permission。允许目录的读写成功，但应被拒绝的临时兄弟文件读写也成功。 |

当时的 `utilityProcess` 权限隔离路线未满足门槛：返回非零不是验收通过。该早期检查点尚未启用完全信任运行时、原生模块或对外监听服务；不代表上文当前实现状态。

建议的替代路线：先保留沙箱内置变换，不开放任意原生代码；若必须使用原生模块，则单独设计受操作系统权限隔离的辅助进程，用 IPC 传递宿主授予的文件或流句柄。先在支持的平台逐项验证越界读写被拒绝、撤权关闭句柄及终止进程，再决定是否开发。不能将忽略的命令行参数、仅显示同意对话框或仅修改 JavaScript API 作为隔离保障。

## Electron Node 入口替代原型（2026-11-20）

`node scripts/check-plugin-node-helper.mjs` 在 Electron 45.0.0 / Node 24.22.0 下返回 0。原型用同一个 Electron 可执行文件，以 `ELECTRON_RUN_AS_NODE=1` 和显式的 `--permission` 参数启动独立子进程；仅使用临时目录，未加载用户插件。

| 检查 | 不允许原生模块 | 允许原生模块 |
| --- | --- | --- |
| `process.permission` 存在 | 是 | 是 |
| 允许目录同步读取、写入 | 成功 | 成功 |
| 兄弟文件同步读写、异步读取 | `ERR_ACCESS_DENIED` | `ERR_ACCESS_DENIED` |
| 派生子进程、创建 worker | `ERR_ACCESS_DENIED` | `ERR_ACCESS_DENIED` |
| 加载临时目录的 Node-API SQLite 模块并调用原生初始化函数 | `ERR_DLOPEN_DISABLED` | 成功 |

权限查询正确作用域是 `process.permission.has('addon')`。原 `utilityProcess` 原型已修正这一查询并重跑，仍然没有 `process.permission`，越界读写仍成功，流式音频与 Range 继续通过。

随后对 `dist/system-tools/win-unpacked/ceru-music.exe` 重跑同一脚本，退出 0；打包后的程序保留了 RunAsNode 能力，两组结果与开发用 Electron 一致。解包产物位于独立候选目录，不覆盖用户安装。脚本第二个参数可以指定待测可执行文件。

`check-plugin-node-ipc.mjs <打包后的 ceru-music.exe>` 退出 0：原型通过 Node IPC 将请求交给实际 Core `createDispatcher`。只读信息和无额外权限提示通过，缺失播放授权和未知私有方法被拒绝。模拟撤销生命周期后，在途链接请求没有执行效果，子进程退出且原型 HTTP 监听关闭。共 5 次请求，仅预期的一次提示计入效果。它是测试夹具及模拟宿主服务，不等于真实插件、安装同意流程或媒体服务已连接。

这证明 Node 入口可以落实上述 JavaScript/Node API 权限检查，为下一步替代 `utilityProcess.fork` 提供依据；它不代表恶意原生代码被系统沙箱隔离。完全信任档仍必须单独确认，原生模块可以绕过 Node API 的限制。产品接入前还需实现正式 RPC 传输、崩溃与撤权生命周期、资源哈希与平台校验。此处尚未连接插件激活流程，不能把阶段九记为完成。
