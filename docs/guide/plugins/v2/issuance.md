---
pageClass: plugin-v2-doc
---

# 签名与个性化发行

适用于需要验证发行者身份、或对同一业务代码按用户发放不同显示信息和配置的作者。普通插件可先完成[构建发布](./publishing)，再使用本章。

## 三种角色

| 文件或角色         | 职责                               |
| ------------------ | ---------------------------------- |
| 普通成品 plugin.js | 编译一次的代码与资源               |
| Publisher 密钥     | 签署核心代码或发行模板             |
| Issuer 密钥        | 按模板允许的字段生成个性化发行数据 |
| delivery.json      | 某次交付的显示、配置或激活数据     |
| customer.js        | 给对应用户的完整单文件插件         |

配置可被持有文件的人读取；个性化不是代码加密，也不能阻止长期密钥被复制。

## 普通签名

```shell
npx ceru-plugin keygen --out .keys/publisher
npx ceru-plugin sign dist/plugin.js --key .keys/publisher.private.pem --out dist/plugin.signed.js
npx ceru-plugin validate dist/plugin.signed.js --trusted-key .keys/publisher.public.pem --json
```

签名使用 Ed25519。保持私钥离开公开仓库和用户成品；公钥可供验证。优先输出独立文件，避免误覆盖待检查成品。

| 校验状态           | 含义                                   |
| ------------------ | -------------------------------------- |
| unsigned           | 没有签名                               |
| verified-untrusted | 签名有效，但校验者没有把公钥配置为可信 |
| verified-trusted   | 签名有效，公钥在校验者提供的可信列表中 |

只看“校验通过”不能判断公钥是否来自你信任的发布者。

## 制作模板并发放

```shell
npx ceru-plugin keygen --out .keys/issuer
npx ceru-plugin template dist/plugin.js --key .keys/publisher.private.pem --issuer-key .keys/issuer.public.pem --out dist/template.js
npx ceru-plugin issue dist/template.js --key .keys/issuer.private.pem --config delivery.json --out dist/customer.js --id demo-delivery-001
npx ceru-plugin validate dist/customer.js --trusted-key .keys/publisher.public.pem --json
```

`delivery.json` 的最小演示：

```json
{
  "display": { "name": "演示用户的曲库" }
}
```

激活数据可包含 `activation: { mode: 'one-time-code', code: '示例兑换码' }`。示例字符串不能替代真实服务端核验；兑换码应由服务端验证、兑换并失效。

## 个性化策略

template 命令可用 `--policy policy.json` 指定 JSON Schema。模板的策略决定允许的 display/config/activation 等字段；未经允许的配置键会被拒绝。

不要根据 README 猜测策略。用发行库的 `createPersonalizationSchema(config)` 查看由构建配置生成的策略，或显式提供策略并验证正反案例。权限、模块入口和核心代码不属于可任意改写的个性化字段。

config 的默认值与个性化值如何组合，见[配置覆盖顺序](./configuration#配置覆盖顺序)。

## 服务端高频发行

在后端项目安装 `@shiqianjiang/ceru-plugin-issuer@latest`，复用 PreparedIssuer：

```ts
import { readFile } from 'node:fs/promises'
import { PreparedIssuer } from '@shiqianjiang/ceru-plugin-issuer'

const issuer = new PreparedIssuer(await readFile('dist/template.js'), {
  issuerPrivateKey: await readFile('.keys/issuer.private.pem', 'utf8'),
  trustedPublicKeys: [await readFile('.keys/publisher.public.pem', 'utf8')]
})

// 业务端先完成用户身份与权益验证。
const artifact = issuer.issue(
  { display: { name: '演示用户的曲库' } },
  { deliveryId: 'demo-delivery-001' }
)
```

| API                                              | 返回 / 行为                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `new PreparedIssuer(input, options)`             | 校验模板并准备复用；input 为 Uint8Array，options 包含 issuerPrivateKey、trustedPublicKeys? |
| `issue(personalization, { deliveryId?, now? }?)` | Buffer，完整发行文件                                                                       |
| `writeTo(writable, personalization, options?)`   | `Promise<void>`，向流写文件；调用者负责结束流                                              |
| `templateDigest`                                 | 模板摘要，用于识别固定主体                                                                 |

鉴权、权益判断、deliveryId 的业务幂等、HTTP 缓存策略和密钥保管由你的服务实现；库不会替代业务数据库。完整发行类型见[参考](./reference#发行库类型)。
