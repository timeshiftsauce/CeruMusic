---
pageClass: plugin-v2-doc
---

# 构建、安装与发布

用户需要的是一个可以安装的 **`plugin.js`**。源码、锁文件、配置和测试应保留在作者工程中；提交源代码仓库时另行提供。

## 发布流程

<PluginDiagram src="/plugins/v2/workflow.svg" alt="源码开发、构建校验、独立预览、桌面安装与发布流程" />

```shell
npm run build
npm run typecheck
npm run validate
npm run preview
```

发布前在澜音 ≥2.0 安装同一个成品文件。检查首次启用、用户拒绝权限、再次启用、重启、更新保留配置和卸载清理。

## 发布说明应包含什么

| 项目       | 示例                                 |
| ---------- | ------------------------------------ |
| 功能与限制 | 连接自建曲库；需要用户自己的服务器   |
| 插件身份   | manifest.id、名称、插件版本          |
| 软件要求   | 澜音 ≥2.0；说明依赖的桌面扩展     |
| 权限       | 为什么需要公网、局域网或歌单写入     |
| 安装方式   | 下载固定版本 JS，打开设置 → 插件安装 |
| 来源与支持 | 源码、作者、许可证、问题反馈地址     |
| 更新       | 变更记录、兼容说明、数据迁移提示     |

源码中的示例域名必须替换或明确禁用。移除私人账号、Cookie、token、卡密、调试日志和发行私钥；用户配置的连接参数不要随公共成品传播。

## 单文件与体积

发行文件限制：完整发行文件 **10 MiB**、头部 JSON **256 KiB**、个性化交付数据 **16 KiB**，并限制解析节点数量。资源另有内部限额，但不能突破完整文件 10 MiB 的限制。体积接近上限时应缩减图片、重复依赖和无用资源。

CLI 打包后台、页面、样式与静态资源。Vue/React 生产代码在成品内，编译器不在。依赖第三方包时确认能在插件沙箱中运行，不能依赖作者机器上的 node_modules。

使用 `preview` 检查离开源码后的行为。静态 validate 只证明格式和校验通过，不替代页面、业务和权限测试。

## 普通发布与签名

未签名文件可以通过格式校验；是否接受由具体 Host 决定。签名用来验证内容与密钥的关系，不自动授予权限，也不等于安全背书。

需要签名或给不同用户发放不同配置时，参见[签名与个性化发行](./issuance)。

## 更新插件

保持 manifest.id 不变，递增 version。通过宿主更新流程更换文件，检查 storage 中旧数据仍可读取。`ctx.ui.pluginUpdate.request` 只加入更新通知，不代表已替换成功。

若修改了权限，重新安装或更新后应验证新的授权流程，不假设旧授权自动覆盖新增范围。

## 投稿社区

[模板与社区插件仓库](https://github.com/CeruMusic/CeruMusic-Plugin-Template)接受完成的插件。典型提交：

```text
plugins/example.author.plugin/
├── plugin.json
├── plugin.js
└── README.md
```

`plugin.json` 示例：

```json
{
  "id": "example.author.plugin",
  "name": "我的曲库",
  "version": "0.1.0",
  "description": "连接自己的音乐服务",
  "author": "作者",
  "license": "MIT",
  "source": "https://github.com/example/plugin",
  "entry": "plugin.js"
}
```

也可用 `download` 和 `sha256` 替代 entry，提供固定版本 HTTPS 地址及该文件的 64 位十六进制 SHA-256。使用自己的真实仓库地址；遵循 [CONTRIBUTING.md](https://github.com/CeruMusic/CeruMusic-Plugin-Template/blob/main/CONTRIBUTING.md)。

社区 CI 做静态检查，不运行投稿插件。GitHub topic `ceru-music` 有助发现，但不自动收录，也不代表官方安全审核。个人化发行文件不要作为公开成品提交。
