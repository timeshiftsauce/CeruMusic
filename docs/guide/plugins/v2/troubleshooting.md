---
pageClass: plugin-v2-doc
---

# 故障排查

先记录：澜音版本、CLI/SDK 版本、模板类型、失败阶段、可脱敏的错误信息，以及是否仅在工作台或桌面发生。

## 按现象定位

| 现象                                  | 常见原因                                 | 处理                                                    |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| 创建失败或安装依赖失败                | Node 太旧、registry 或 Electron 下载失败 | Node ≥22.12；检查安装日志与网络                         |
| 找不到 @ceru/plugin-config            | 类型还未生成                             | 先 build 或 dev，再 typecheck                           |
| F5 没启动当前插件                     | 打开父工作区或选错调试配置               | 打开 ceru-plugin.code-workspace，选择正确 Launch/Attach |
| 端口被占用                            | dev 与 preview 同时运行                  | 关闭旧工作台，或同时更改 port/debug-port                |
| Provider / Action 未声明              | Manifest 与注册 ID 不一致                | commands 匹配 action，其他注册匹配 id                   |
| 搜到演示歌曲但不能播放                | source 演示没有真实播放服务              | 按 Provider 章节接入合法地址                            |
| Invalid content item / Track metadata | 返回了平台原始对象                       | 补齐 ref、title、capabilities、metadata.artists         |
| 无限翻页                              | nextCursor 未前进                        | 按请求游标推进；结束时省略 nextCursor                   |
| HTTP 未授权                           | key 不匹配或用户拒绝                     | 检查 Manifest、permissionKey 与权限界面                 |
| localhost/内网访问失败                | 只有公网权限                             | 另声明并申请 network.private                            |
| 工作台请求失败，桌面成功              | 代理限额/保留头/端口限制不同             | 对照 HTTP 限额表，缩减响应并移除保留头                  |
| HTTP 非 2xx 抛异常                    | create 客户端默认 throwHttpErrors:true   | catch HttpError，或显式关闭并检查 status                |
| 插件存储超过 10 MiB                   | 全部数据加权限记录超过总额               | 清理已知缓存键，减少保存字段                            |
| 跨插件读取失败                        | ID 不对、未安装或未共享                  | 检查稳定 ID 与 readableBy                               |
| Schema 在工作台可见，桌面报无效       | 不是桌面 drawer schema                   | 添加 presentation 与受支持 form 控件                    |
| 设置按钮无内容                        | settingsPages.view 不匹配 Surface        | 校验 view、Surface id 与资源 entry                      |
| Surface 白屏                          | 打包入口/资源错误、运行时异常            | 看控制台，使用成品 preview 检查                         |
| 尚未接入能力 / host-not-connected     | SDK 契约没有宿主实现                     | 对照支持表，不以类型检查代替运行检查                    |
| 更新返回 queued:true                  | 只是加入更新通知                         | 等待宿主后续交互，不提示“安装完成”                      |
| 签名 verified-untrusted               | 没配置可信发布者公钥                     | 使用真实可信公钥验证，不能自动信任文件附带公钥          |

## 排查顺序

1. **构建**：`npm run build`，解决类型与入口错误。
2. **静态校验**：`npm run validate`，检查清单和成品格式。
3. **成品预览**：`npm run preview`，排除源码开发环境依赖。
4. **桌面安装**：用隔离演示数据复现，核对权限和支持版本。
5. **缩小示例**：回到最小模板，只加入导致失败的改动。

## 提交可复现问题

提供最小源码、Manifest 中相关声明、脱敏日志、复现操作与预期结果。不要发送私人插件发行文件、账号凭据、完整 HTTP Authorization 头或发行私钥。

[工具链问题](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/issues)与[模板仓库](https://github.com/CeruMusic/CeruMusic-Plugin-Template)可用于反馈；桌面特有问题应附澜音版本和插件支持状态。
