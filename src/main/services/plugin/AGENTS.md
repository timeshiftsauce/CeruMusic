# 插件宿主

- `index.ts` 管理已安装文件、状态及运行实例。扫描只读识别文件，插件的运行由显式启用或恢复触发。损坏的文件仍显示在设置中，不要清理用户文件。
- `runtimes.ts` 静态识别协议，安装和扫描均由对应 core 完整校验。注释头脚本交给用户选择的兼容环境。
- `v2/V2PluginHost.ts` 使用冻结的 v2 别名包与独立 worker；v2 专用清单投影与分享解析位于同目录。
- `hostServices.ts` 负责桌面能力和按插件隔离的文件句柄、快捷键、定时任务。协议层先做权限和所有者检查，再调用服务；停止时释放资源。
- `v3/V3PluginHost.ts` 使用独立 core、worker、Surface 会话和契约分发。两代均通过 `shared/permissions.ts` 读取同一权限账本；不允许使用 v2 沙箱作为回退。
- 界面与宿主消费者只读 `src/common/pluginDescriptor.ts` 描述对象，不回写原始 manifest，不向渲染进程暴露私有 config。
- 回归：运行 `yarn test --runInBand --runTestsByPath src/main/services/plugin/__tests__/upgrade.test.ts`。测试使用一次性 profile 和实际 worker，不使用个人数据。
- `operations/bus.ts` 统一处理播放、音源解析、歌单、搜索、窗口、歌词、下载、分享、公开链接和软件内提示。新增操作必须同步 SDK、Core 验证器、v3 注册/撤权、设置活动面板和作者测试工具。
- 登录回调、安装链接和带凭据的 URL 不进入链接钩子；权限、安装、修复及带交互控件的提示不进入普通文字提示钩子。不能让插件拦截管理插件自身的操作。
- `trusted/consent.ts` 将完全信任同意绑定插件、签名发布者和无限制文件访问模式；`trusted/utilityProcess.ts` 经专用 MessagePort 启动 Electron utilityProcess，同意撤销时取消专用分发器并终止进程。Electron 45 不启用 Node 权限模型，须显示可访问所有文件的警告，不得复用旧受限模式同意。
- 沙箱 HTTP 由 Core 的 `PluginHttpServer` 在宿主监听、实际 worker 处理 Request/Response。端口只登记给拥有者，监听与 LAN 权限分别检查。主进程不得执行插件处理函数。
- `media/mediaProtocol.ts` 管理临时媒体令牌、本机端口归属和流生命周期；内置解密、自定义 worker 变换、缓存、下载及 DLNA 路由复用媒体管线。专用目录和端口随停用、撤权、卸载释放。
