# Ceru Plugin Issuer

Node.js / TypeScript 静态验证、Ed25519 签名与缓存模板发放。

```ts
import { readFile } from 'node:fs/promises'
import { PreparedIssuer, readArtifact } from '@shiqianjiang/ceru-plugin-issuer'

const issuer = new PreparedIssuer(await readFile('template.js'), {
  issuerPrivateKey: await readFile('issuer.private.pem', 'utf8'),
  trustedPublicKeys: [await readFile('publisher.public.pem', 'utf8')],
})

const bytes = issuer.issue({ display: { name: '我的音源' } })
console.log(readArtifact(bytes).signatureStatus)
```

准备一次后，重复 issue 不重新构建或扫描核心代码。writeTo 支持背压与共享主体流式输出，调用者负责结束流、下载鉴权和缓存策略。

签名有效不等于发布者已被信任；未提供可信公钥时结果为 verified-untrusted。静态校验不执行插件，也不替代生产沙箱。个性化文件不得提交到公开社区仓库。

0.2.0 静态读取 `exports.manifest` / `exports.package`，并从 `exports.activate`、`exports.surfaces`、`exports.modules` 提取运行入口。旧 `CeruPlugin.define()` v2 容器仍可验证，但会返回迁移提示；v1 注释头只用于识别迁移来源，不能绕过 v2 Manifest 和权限模型直接运行。

`exports.manifest.config` 是同样可静态读取的 JSON 兼容对象。`createTemplate()` 默认从配置字段和类型生成 `personalization.config` 策略；`PreparedIssuer` 只能覆盖该策略允许的配置。`resolveArtifactConfig()` 递归合并清单默认值与签名交付值，业务代码与后端无需改写 bundle。

[完整协议与命令](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme)
