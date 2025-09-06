# WebDAV 同步配置指南

本项目包含两个 GitHub Actions 工作流，用于自动将 GitHub Releases 同步到 alist（WebDAV 服务器）。

## 工作流说明

### 1. 手动同步工作流 (`sync-releases-to-webdav.yml`)
- **触发方式**: 手动触发 (workflow_dispatch)
- **功能**: 同步现有的所有版本或指定版本到 WebDAV
- **参数**: 
  - `tag_name`: 可选，指定要同步的版本标签（如 v1.0.0），留空则同步所有版本

### 2. 自动同步工作流 (`auto-sync-release.yml`)
- **触发方式**: 当新版本发布时自动触发 (on release published)
- **功能**: 自动将新发布的版本同步到 WebDAV
- **参数**: 无需手动设置，自动获取发布信息

## 配置要求

在 GitHub 仓库的 Settings > Secrets and variables > Actions 中添加以下密钥：

### 必需的 Secrets

1. **WEBDAV_BASE_URL**
   - 描述: WebDAV 服务器的基础 URL
   - 示例: `https://your-alist-domain.com/dav`
   - 注意: 不要在末尾添加斜杠

2. **WEBDAV_USERNAME**
   - 描述: WebDAV 服务器的用户名
   - 示例: `admin`

3. **WEBDAV_PASSWORD**
   - 描述: WebDAV 服务器的密码
   - 示例: `your-password`

4. **GITHUB_TOKEN**
   - 描述: GitHub 访问令牌（通常自动提供）
   - 注意: 如果默认的 `GITHUB_TOKEN` 权限不足，可能需要创建个人访问令牌

## 使用方法

### 手动同步现有版本

1. 进入 GitHub 仓库的 Actions 页面
2. 选择 "Sync Existing Releases to WebDAV" 工作流
3. 点击 "Run workflow"
4. 可选择指定版本标签或留空同步所有版本
5. 点击 "Run workflow" 开始执行

### 自动同步新版本

当您发布新的 Release 时，`auto-sync-release.yml` 工作流会自动触发，无需手动操作。

## 文件结构

同步后的文件将按以下结构存储在 alist 中：

```
/yd/ceru/
├── v1.0.0/
│   ├── app-setup.exe
│   ├── app.dmg
│   └── app.AppImage
├── v1.1.0/
│   ├── app-setup.exe
│   ├── app.dmg
│   └── app.AppImage
└── ...
```

## 故障排除

### 常见问题

1. **上传失败**
   - 检查 WebDAV 服务器是否正常运行
   - 验证用户名和密码是否正确
   - 确认 WebDAV URL 格式正确

2. **权限错误**
   - 确保 WebDAV 用户有写入权限
   - 检查目标目录是否存在且可写

3. **文件大小不匹配**
   - 网络问题导致下载不完整
   - GitHub API 限制或临时故障

4. **目录创建失败**
   - WebDAV 服务器不支持 MKCOL 方法
   - 权限不足或路径错误

### 调试步骤

1. 查看 Actions 运行日志
2. 检查 WebDAV 服务器日志
3. 验证所有 Secrets 配置正确
4. 测试 WebDAV 连接是否正常

## 安全注意事项

1. **密钥管理**
   - 不要在代码中硬编码密码
   - 定期更换 WebDAV 密码
   - 使用强密码

2. **权限控制**
   - 为 WebDAV 用户设置最小必要权限
   - 考虑使用专用的同步账户

3. **网络安全**
   - 建议使用 HTTPS 连接
   - 考虑 IP 白名单限制

## 自定义配置

如需修改同步路径或其他配置，请编辑对应的工作流文件：

- 修改存储路径: 更改 `remote_path` 变量
- 调整重试逻辑: 修改错误处理部分
- 添加通知: 集成 Slack、邮件等通知服务

## 支持的文件类型

工作流支持同步所有类型的 Release 资源文件，包括但不限于：
- 可执行文件 (.exe, .dmg, .AppImage)
- 压缩包 (.zip, .tar.gz, .7z)
- 安装包 (.msi, .deb, .rpm)
- 其他二进制文件

## 版本兼容性

- GitHub Actions: 支持最新版本
- alist: 支持 WebDAV 协议的版本
- 操作系统: Ubuntu Latest (工作流运行环境)