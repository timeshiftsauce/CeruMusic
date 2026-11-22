---
pageClass: plugin-v3-doc
title: 账号、扫码登录与原生音乐库
---

# 账号、扫码登录与原生音乐库

> **适用读者**　接入第三方账号的音源作者。**前置条件**　支持 v3 的桌面和 account-qrcode 模板。**学习目标**　从登录回执定位到正确的账号连接。预计 15 分钟。

<PluginDiagram src="/plugins/v3/diagrams/account.svg" alt="扫码登录中的三方分工，桌面宿主、插件与平台、宿主保存连接" />

账号插件负责为某个平台提供登录能力、账号资料和音乐内容。宿主负责弹窗外壳、账号选择、凭据保管与切换流程。

## 实战一：修改扫码弹窗内部内容

```sh
npx --yes create-ceru-plugin@3.0.0 ceru-account-demo --template account-qrcode --lang ts
cd ceru-account-demo
npm install
npm run dev
```

1. 在桌面开发者模式添加产物，从账号菜单打开「扫码登录演示」。模板无需真实扫码或网络，约 5 秒后显示已扫码，约 10 秒后完成。
2. 在 `src/index.ts` 找到 `loginView`。设为 `undefined` 使用宿主模板，设为 `'login'` 使用 `src/Login.vue`，设为 `'login-html'` 使用 `src/login-html.ts`。
3. 每次改完保存，等待终端重建。关闭原弹窗，在账号菜单重新发起登录。若已经创建演示账号，可退出演示账号或使用账号的重新登录入口。试一下取消，以及切换主题后重开预览。

`manifest.entry.views` 声明自定义视图，`manifest.provides.accounts` 声明账号类型，Logic 用同一 ID 调用 `ctx.accounts.register`。登录方法将可选 `view` 传给 `auth.qrcode`。可以传 PNG data URL `image`，或让宿主生成 HTTPS `url` 的二维码，两者选一个。

Vue 用 `useViewState<{ login: AccountQrViewState }>()` 接收状态，纯 HTML 用 `ctx.subscribe`；二维码、过期时间和等待状态来自宿主。关闭用 Vue 的 `useView().close()` 或 HTML 的 `ctx.close()`。插件只改内部布局，弹窗标题、进出动画、关闭和主题由软件管理。两种自定义内容都有独立 iframe，因此 HTML 的全局选择器不会改变外层桌面。可直接用 `--td-brand-color`、`--td-text-color-primary` 等 CSS 变量。

## 接入真实平台

| 登录方式 | Logic 入口 | 要验证的事 |
| --- | --- | --- |
| `form` | `auth.form({ fields })` | 提交后向平台验证输入，取消不新增连接 |
| `qrcode` | `auth.qrcode({ image, expiresInMs, poll, view })` | 轮询使用本次 `operation`，区分 waiting、scanned、expired、done |
| `browser` | `auth.browser({ url, until: { cookie } })` | 独立登录窗口，显式声明捕获域名与使用来源 |
| `oauth` | `auth.oauth({ authorizationUrl, tokenUrl, clientId, scopes })` | 公共客户端与 PKCE，按宿主和平台文档配置回调 |

登陆成功后由宿主保存凭据。用 `profile(account, operation)` 返回平台公开资料，其他接口按 `account.id`（宿主连接 ID）区分子账号。请求用 `credential: account.credential` 和网络权限键，发送范围由 HTTPS `binding.origin` 及 `credentials.use.scope.origins` 一起限制。令牌或 Cookie 留在凭据链路，页面只接收显示数据。

**扫码成功但随后读资料报“未授权此来源使用账号凭据”**时，比较登录结果的绑定来源、`credentials.use` 的实际授权来源及资料请求 URL 的 `origin`，都要核对协议、域名、非默认端口和跳转。扫码返回成功只能说明登录已完成，后续请求仍有单独的凭据使用校验。修正声明或绑定后，以用户授权重新登录；不能在请求里手工拼接 Cookie 代替授权。

## 实战二：两个子账号和原生音乐库

新建 `--template connected-library --lang ts` 工程，安装依赖，运行 `npm run dev` 并添加产物。打开账号菜单的「音乐库账号」，输入两个不同演示昵称，切换后核对推荐、喜欢、歌单和历史。此模板使用演示数据。修改歌曲列表或歌单网格时，优先看模板提供的 `defineNativeView`，宿主读取标准内容并复用自己的详情页。

接入时，`likes.list`、`history.list`、`recommend.list` 返回曲目页，`playlists.list` 返回歌单页。保留连接 ID 与所属音源，不把第一账号的分页游标或缓存用于第二账号。平台明确返回凭据失效时，可用 `ctx.accounts.reportExpired(accountId, connectionId, credential)` 上报那次请求实际使用的句柄。取消登录、权限撤销、重启保留、两个子账号数据和退出应分别验证。

详细字段见 [账号 SDK 指南](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/docs/ACCOUNTS.md)和[原生音乐库接入](./native)。

## 把扫码过程拆成四次观察

| 观察点 | 演示模板里会看到什么 | 真平台接入时查哪里 |
| --- | --- | --- |
| 打开 | 宿主出现二维码和关闭按钮 | 这次 login 是否返回有效二维码；自定义 view ID 与清单是否一致 |
| 等待与已扫 | 模板约五秒后可进入已扫状态 | 检查本次 poll 的返回状态，已扫期间继续等待用户确认 |
| 完成 | 本地示例随后完成登录，账号菜单可见连接 | 检查 done 回执、profile 的凭据绑定来源，勿记录凭据本身 |
| 取消或过期 | 关闭弹窗应结束本轮登录 | 丢弃旧票据；重开时创建新一轮，避免旧响应覆盖新账号 |

修改 `src/index.ts` 中的 `loginView` 后，要重新发起登录才会创建新视图。比较默认、Vue 和 HTML 三种显示方式时始终使用同一套本地演示数据，先排除界面问题，再换成真实平台客户端。
