# v3 运行环境

本地开发使用 `vendor/plugin-runtime/v3/` 的包。`V3PluginHost.ts` 使用 v3 core 的 worker、契约分发和 Surface 会话；解析或激活失败不会回退到 v2。桌面文件句柄与任务按插件实例隔离，两代读取相同的配置、权限和子插件目录。

`manifest.ts` 只投影公开描述。依赖项中的 `pluginId` 是贡献所属的已安装插件，`targetPluginId` 是依赖的目标清单 ID。声明新能力不代表已实现或授权。
