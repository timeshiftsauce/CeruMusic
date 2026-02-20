# 后端 API 对接文档

本文档旨在指导第三方客户端（Web/移动端）如何接入 CeruMusic 后端服务。

## 接口文档
CeruMusic 后端基于 NestJS 开发，提供完整的 Swagger UI 文档。

- **Swagger UI 地址**: [https://api.ceru.shiqianjiang.cn/api-docs/#/](https://api.ceru.shiqianjiang.cn/api-docs/#/)

## 鉴权方式 (Logto SSO)
本项目使用 Logto 进行 OAuth 2.0 / OIDC 单点登录 (SSO)。客户端需要通过 Logto 获取 Access Token，并在请求头中携带该 Token 才能访问受保护的 API 接口。

### 关键配置信息
客户端集成时需要使用以下配置：

| 配置项 | 值 | 说明 |
| :--- | :--- | :--- |
| **Logto 端点** | `https://auth.shiqianjiang.cn/` | Logto 服务的根地址 |
| **应用 ID (App ID)** | `2a22nn23flw9nyrwi6jw9` | 用于标识当前客户端应用 |
| **API 资源标识符 (API Identifier)** | `https://api.ceru.shiqianjiang.cn/api` | **重要**：请求 Token 时必须包含此 Resource，否则后端会拒绝访问 |

### 客户端集成指南 (React 示例)

要访问受保护的 API，客户端必须在配置 Logto SDK 时声明所需的 API 资源 (`resources`)，并在请求时获取对应的 Access Token。

#### 1. 配置 LogtoProvider

在初始化 `LogtoProvider` 时，将 **API 资源标识符** 添加到 `resources` 数组中。

```javascript
import { LogtoProvider } from '@logto/react';

const config = {
  endpoint: 'https://auth.shiqianjiang.cn/',
  appId: '2a22nn23flw9nyrwi6jw9',
  // 重要：必须声明要访问的 API 资源
  resources: ['https://api.ceru.shiqianjiang.cn/api'],
  // 可选：如果 API 需要特定的权限 Scope，也需要在此声明
  // scopes: ['read:user', 'write:playlist'],
};

const App = () => {
  return (
    <LogtoProvider config={config}>
      <Content />
    </LogtoProvider>
  );
};
```

#### 2. 获取 Access Token 并调用 API

使用 `useLogto` 钩子中的 `getAccessToken` 方法获取用于访问 API 的令牌。

```javascript
import { useLogto } from '@logto/react';
import { useEffect } from 'react';

const Content = () => {
  const { getAccessToken, isAuthenticated } = useLogto();

  useEffect(() => {
    const fetchApi = async () => {
      if (isAuthenticated) {
        try {
          // 获取指定资源的 Access Token
          // 注意：参数必须与 config.resources 中的 API Identifier 完全一致
          const accessToken = await getAccessToken('https://api.ceru.shiqianjiang.cn/api');

          // 使用 Access Token 调用 API
          const response = await fetch('https://api.ceru.shiqianjiang.cn/api/products', {
            headers: {
              // 在请求头中添加 Authorization: Bearer <token>
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (response.status === 401 || response.status === 403) {
             console.error('Access Denied: Check if the token has the correct scopes.');
          }

          // 处理响应...
        } catch (error) {
          console.error('Failed to get access token:', error);
        }
      }
    };

    fetchApi();
  }, [isAuthenticated, getAccessToken]);

  return <div>Check console for token</div>;
};
```

### OIDC 参考信息 (可选)

如果使用非 SDK 方式对接（如自行实现 OAuth 流程），可参考以下标准 OIDC 端点：

- **OpenID Provider 配置**: `https://auth.shiqianjiang.cn/oidc/.well-known/openid-configuration`
- **授权端点 (Authorization)**: `https://auth.shiqianjiang.cn/oidc/auth`
- **令牌端点 (Token)**: `https://auth.shiqianjiang.cn/oidc/token`
- **用户信息端点 (UserInfo)**: `https://auth.shiqianjiang.cn/oidc/me`

### 更多资源

关于 Logto API 保护机制、RBAC (基于角色的访问控制) 以及 JWT 的详细说明，请参考 Logto 官方文档：

- **API 保护指南**: [https://docs.logto.io/zh-CN/api-protection](https://docs.logto.io/zh-CN/api-protection)

该文档涵盖了以下核心概念，有助于理解鉴权流程：
- **认证 (Authentication) 与授权 (Authorization)** 的区别
- **基于角色的访问控制 (RBAC)**：了解权限和角色的工作原理
- **JSON Web Token (JWT)**：了解 Token 结构及验证方式
