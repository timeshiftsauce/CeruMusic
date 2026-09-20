---
pageClass: plugin-v2-doc
---

# HTTP 请求

HTTP 通过宿主代理执行。插件声明 `network.request` 并取得授权后，可访问公网 HTTP(S)；localhost、局域网和其他私网地址还需 `network.private`。

## 从本地数组走向服务器

[搜索教程](./first-search)把歌曲写在数组中。连接真实服务后，变化的是“这些歌曲从哪里来”：用 HTTP 取回服务端数据，再整理成同样的歌曲格式。

本页的 `music.example.com` 是示例地址，不能直接获取音乐。练习网络调用前，需要你自己的、允许访问的服务地址。

## 创建客户端

```ts
const client = ctx.http.create({
  baseURL: 'https://music.example.com/',
  permissionKey: 'api',
  requestPermission: true,
  headers: { Accept: 'application/json' }
})
```

`music.example.com` 是占位地址，运行前换成你有权使用的服务。清单中声明 `{ key: 'api', name: 'network.request', reason: '读取音乐服务' }`。

| 创建参数            | 类型 / 默认                                      | 说明                                            |
| ------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `baseURL`           | string，可选                                     | 相对路径基准；缺省时请求必须是绝对 URL          |
| `permissionKey`     | string 或 `(url: URL) => string`；默认 `network` | 匹配 Manifest 的 key，不是域名白名单            |
| `requestPermission` | boolean；默认不自动申请                          | true 时向宿主请求授权；仍由宿主决定是否显示提示 |
| `headers`           | 字符串映射                                       | 默认头，与单次请求头合并                        |

SDK 注释与部分实现对拒绝后的重试描述不同。应以宿主的用户决定为准：不要通过自动重复调用绕过拒绝。

## 请求方法与返回

```ts
client.request<T>(address, options): Promise<HttpResponse<T>>
client.get<T>(address, options): Promise<T>
client.post<T>(address, options): Promise<T>
client.authorize(key, origin, operation): Promise<void>
```

`request` 返回 `{ status: number, headers: Record<string, string>, data: T }`。`get/post` 直接返回 data，**不是 AxiosResponse**。authorize 仅处理授权，origin 不会收紧到域名级权限。

| 请求参数          | 类型 / 默认            | 说明                                                        |
| ----------------- | ---------------------- | ----------------------------------------------------------- |
| `operation`       | OperationContext，必需 | 使用宿主传入的上下文，支持取消                              |
| `permissionKey`   | string，可选           | 覆盖客户端默认 key                                          |
| `query`           | 键值映射；值可为数组   | 字符串/数字/布尔；忽略 null/undefined；数组编码为重复 query |
| `method`          | string，默认 GET       | get/post 方法会固定相应方法                                 |
| `headers`         | 字符串映射             | 不能含换行；部分连接头由宿主管理                            |
| `json`            | JSON 可序列化值        | JSON 请求体                                                 |
| `form`            | 简单键值映射           | URL 编码表单，忽略 null/undefined                           |
| `body`            | string                 | 原始文本请求体                                              |
| `timeoutMs`       | number，可选           | 受宿主上下限约束                                            |
| `throwHttpErrors` | boolean，默认 true     | 非 2xx 抛 HttpError；false 时自行检查状态码                 |
| `credential`      | CredentialRef，可选    | SDK 契约；当前桌面未接入凭据引用服务                        |

`json / form / body` 三选一，同时设置会失败。URL 中不能包含 username/password，不支持 file、data 等协议。

## 可复用的请求示例

以下函数由 Provider 或 Action 回调调用，把原始 operation 传入：

```ts
import { HttpError } from '@shiqianjiang/ceru-plugin-sdk'
import type { OperationContext, PluginContext } from '@shiqianjiang/ceru-plugin-sdk'

export async function searchRemote(ctx: PluginContext, operation: OperationContext, query: string) {
  const client = ctx.http.create({
    baseURL: 'https://music.example.com/',
    permissionKey: 'api',
    requestPermission: true
  })
  try {
    return await client.get<{ items: { id: string; title: string }[] }>('tracks', {
      query: { q: query, limit: 20 },
      operation,
      timeoutMs: 10000
    })
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) {
      ctx.log.warn('服务暂时限流')
    }
    throw error
  }
}
```

T 只提供类型提示，不会校验上游 JSON。转换为标准歌曲前应检查数组与必要字段，见[Provider](./providers)。

## 低层请求

`ctx.http.request({ permissionKey, url, operation, method?, headers?, body?, timeoutMs?, credential? })` 返回 `Promise<{ status, headers, body }>`。这里的响应字段叫 **body**，与便捷客户端的 **data** 区分。

低层接口通常保留非 2xx 状态；业务自行处理。新代码推荐使用 create，避免重复实现 JSON、表单与错误转换。

## 当前资源限制

| 限制               | CLI 0.3.5 工作台                   | 桌面 1.14.1 / Core 0.3.5 |
| ------------------ | ---------------------------------- | ------------------------ |
| 默认 HTTP 超时     | 15,000 ms                          | 30,000 ms                |
| timeoutMs 有效区间 | 1,000–30,000 ms                    | 1,000–60,000 ms          |
| 请求体             | 1 MiB                              | 4 MiB                    |
| 响应体             | 2 MiB                              | 16 MiB                   |
| 自动跟随重定向     | 最多 5 次                          | 最多 5 次                |
| 自动业务重试       | 无                                 | 无                       |
| 响应转换           | UTF-8 文本，JSON 可解析则返回 JSON | 同左                     |

以上为网络代理限额。**工作台 RPC 的整个请求 JSON 还受 256 KiB 输入上限约束**，包含参数和请求体，因此实际请求也必须满足这一更小的限制。不要仅按 HTTP 的 1 MiB 计算。避免用此文本接口传音乐文件或大块二进制。

工作台拒绝保留连接头（如 Host、Connection、Content-Length、Accept-Encoding），桌面过滤部分保留头。两者重定向实现也不同：桌面会在跨源时移除敏感请求头；不要假定工作台具备同样行为，避免把带凭据请求发往不可控重定向地址。

私网授权在重定向目标上也会检查。工作台还保留自己的服务端口和调试端口，不能把它们作为插件请求目标。

## 取消、限流与错误

操作取消会传递给桌面网络请求；回调中也应检查 `operation.signal`。用户拒绝权限、DNS/连接失败、超时、超额响应和无效请求会拒绝 Promise。

`HttpError` 提供 `status`、`response`、`origin`。返回给播放器时应转换为 [MusicFault](./providers#失败与恢复)，区分 NETWORK_ERROR、RATE_LIMITED、AUTH_REQUIRED 等，不把所有错误都当作没有歌曲。

旧代码中的 `httpFetch(...).promise` 可用 SDK `legacy-http` 辅助迁移，但新插件优先使用上述客户端；旧 HTTP 地址可能被适配器升级为 HTTPS。
