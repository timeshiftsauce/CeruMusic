# Alist 下载配置说明

## 概述

项目已从 GitHub 下载方式切换到 Alist API 下载方式，包括：

- 桌面应用的自动更新功能 (`src/main/autoUpdate.ts`)
- 官方网站的下载功能 (`website/script.js`)

## 配置步骤

### 1. 修改 Alist 域名

#### 桌面应用配置

在 `src/main/autoUpdate.ts` 文件中，Alist 域名已配置为：

```typescript
const ALIST_BASE_URL = 'http://47.96.72.224:5244'
```

#### 网站配置

在 `website/script.js` 文件中，Alist 域名已配置为：

```javascript
const ALIST_BASE_URL = 'http://47.96.72.224:5244'
```

如需修改域名，请同时更新这两个文件中的 `ALIST_BASE_URL` 配置。

### 2. 认证信息

已配置的认证信息：

- 用户名: `ceruupdata`
- 密码: `123456`

### 3. 文件路径格式

文件在 Alist 中的路径格式为：`/{version}/{文件名}`

例如：

- 版本 `v1.0.0` 的安装包 `app-setup.exe` 路径为：`/v1.0.0/app-setup.exe`

## 工作原理

### 桌面应用自动更新

1. **认证**: 使用配置的用户名和密码向 Alist API 获取认证 token
2. **获取文件信息**: 使用 token 调用 `/api/fs/get` 接口获取文件信息和签名
3. **下载**: 使用带签名的直接下载链接下载文件
4. **备用方案**: 如果 Alist 失败，自动回退到原始 URL 下载

### 网站下载功能

1. **获取版本列表**: 调用 `/api/fs/list` 获取根目录下的版本文件夹
2. **获取文件列表**: 获取最新版本文件夹中的所有文件
3. **平台匹配**: 根据用户平台自动匹配对应的安装包文件
4. **生成下载链接**: 获取文件的直接下载链接
5. **备用方案**: 如果 Alist 失败，自动回退到 GitHub API

## API 接口

### 认证接口

```
POST /api/auth/login
{
  "username": "ceruupdata",
  "password": "123456"
}
```

### 获取文件信息接口

```
POST /api/fs/get
Headers: Authorization: {token}  # 注意：直接使用 token，不需要 "Bearer " 前缀
{
  "path": "/{version}/{fileName}"
}
```

### 获取文件列表接口

```
POST /api/fs/list
Headers: Authorization: {token}  # 注意：直接使用 token，不需要 "Bearer " 前缀
{
  "path": "/",
  "password": "",
  "page": 1,
  "per_page": 100,
  "refresh": false
}
```

### 下载链接格式

```
{ALIST_BASE_URL}/d/{filePath}?sign={sign}
```

## 测试方法

项目包含了一个测试脚本来验证 Alist 连接：

```bash
node scripts/test-alist.js
```

该脚本会：

1. 测试服务器连通性
2. 测试用户认证
3. 测试文件列表获取
4. 测试文件信息获取

## 备用机制

两个组件都实现了备用机制：

### 桌面应用

- 主要：使用 Alist API 下载
- 备用：如果 Alist 失败，使用原始 URL 下载

### 网站

- 主要：使用 Alist API 获取版本和文件信息
- 备用：如果 Alist 失败，回退到 GitHub API
- 最终备用：跳转到 GitHub releases 页面

## 注意事项

1. 确保 Alist 服务器可以正常访问
2. 确保配置的用户名和密码有权限访问相应的文件路径
3. 文件必须按照指定的路径格式存放在 Alist 中
4. 网站会自动检测用户操作系统并推荐对应的下载版本
5. 所有下载都会显示文件大小信息
