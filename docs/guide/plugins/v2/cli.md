---
pageClass: plugin-v2-doc
title: 脚手架与 CLI
---

# 脚手架与 CLI

要求 Node.js **22.12+**。在工程中使用 npm scripts 或 <code>npx ceru-plugin</code> 调用本地 CLI，无需全局安装。各依赖的用途见[开发环境与依赖](./sdk-upgrade)。

## 创建与列出模板

```shell
npm create ceru-plugin@latest
npm create ceru-plugin@latest my-plugin -- --template vue --lang ts
```

第一种交互选择目录、模板和语言；第二种一次指定。已有本地 CLI 时也可以：

```shell
npx ceru-plugin list-templates
npx ceru-plugin init my-plugin --template source --lang js
```

模板来自 CLI 内置快照，创建时不会执行远端仓库脚本。九种模板的选择建议见[模板页](./templates)。

## 开发命令

| 命令                  | 参数与默认值                                                                     | 用途                   |
| --------------------- | -------------------------------------------------------------------------------- | ---------------------- |
| <code>build</code>    | <code>--project</code>、<code>--out</code>                                       | 类型检查并构建单文件   |
| <code>dev</code>      | <code>--port 4179</code>、<code>--debug-port 9223</code>、<code>--no-open</code> | 监听、构建并运行工作台 |
| <code>preview</code>  | plugin.js、端口参数                                                              | 只运行指定成品         |
| <code>validate</code> | plugin.js、可选可信公钥与 JSON 输出                                              | 检查结构、摘要和签名   |

```shell
npx ceru-plugin build --project . --out dist/plugin.js
npx ceru-plugin validate dist/plugin.js --json
npx ceru-plugin preview dist/plugin.js
```

失败命令会返回非零退出码，适合 CI。validate 不执行插件业务；签名有效也不表示代码安全。

## 端口与调试

```shell
npm run dev -- --port 4180 --debug-port 9224
npx ceru-plugin preview dist/plugin.js --port 4181 --debug-port 9225
```

<code>--no-open</code> 只启动本地服务，不自动打开工作台窗口。不要把开发工作台端口暴露到公网。

VS Code 调试：

1. 打开脚手架生成的 <code>ceru-plugin.code-workspace</code>。
2. 在“运行和调试”选择 “Launch Ceru plugin”，按 F5。
3. 已启动同一工程时选择 “Attach to Ceru plugin”。
4. 在 action 或 Provider 回调中打断点，再从工作台触发。
5. 激活代码已经执行时，点击工作台“重新运行”。

## 签名与发行命令

| 命令                                          | 结果                 |
| --------------------------------------------- | -------------------- |
| <code>keygen --out .keys/publisher</code>     | 生成发行公钥与私钥   |
| <code>sign plugin.js --key private.pem</code> | 生成签名插件         |
| <code>template plugin.js ...</code>           | 创建可个性化发行模板 |
| <code>issue template.js ...</code>            | 生成具体用户发行文件 |

完整顺序见[签名与个性化发行](./issuance)。

## 判断实际安装版本

```shell
npm ls @shiqianjiang/ceru-plugin-cli @shiqianjiang/ceru-plugin-sdk
npm view create-ceru-plugin version dist.integrity
```
