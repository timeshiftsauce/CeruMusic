# SDK 变更记录

## 0.3.1

- 播放解析结果新增 `requestHeaders`，供 Host 在获取对应临时媒体地址时附加防盗链、认证或客户端请求头；请求头只保留在 Host 主进程，并按完整 URL 与到期时间隔离。

## 0.3.0

- 正式声明 Web Surface 的 title、presentation 和 lifecycle；界面与业务由插件实现，宿主仅提供容器。
- CLI 和 Core 共用 SurfaceSession，统一打开、关闭、取消请求和过期会话校验。
- 开发工作台按页面分发状态，支持关闭页面和私有存储持久化；页面不接收清单中的默认凭据。
- Core 正式导出 /guests、/surface、/surface-document，恢复已使用的 Guest 和分享能力，消除本机 node_modules 补丁。
- 五个工具链包与脚手架模板统一到 0.3.0。以下 0.2.5 的类型改动一并发布。

## 0.2.5

- 从根入口及 `/guests`、`/share`、`/storage` 导出 Guest、分享解析与存储类型。
- 同步 PluginContext 的 Guest 管理、插件更新、歌单导入参数与 Storage 空值/共享键签名。
- 补齐 GuestBootstrapAPI、Manifest 分享入口、命令说明、Guest 展示信息与菜单说明。
- 打包前自动构建并检查公开导出文件，避免源码中存在但 npm tarball 缺失。
- 新增真实打包、隔离安装、严格类型检查及运行时子路径导入测试。
- 将 CommonJS 宿主模块声明明确标为 .d.cts，兼容 NodeNext 与 Bundler 模式。
- 避免公开 Buffer 返回类型依赖开发环境中的 Node Buffer 泛型声明。

运行能力由 Host 决定；本次类型补充不会为旧宿主添加业务实现。
