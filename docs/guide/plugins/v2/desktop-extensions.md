---
pageClass: plugin-v2-doc
---

# 桌面扩展与 npm 类型差异

本页记录当前 **澜音 2.0 桌面实现**的补充接口。CLI 工作台不会因为导入了这些类型就获得桌面功能。

## 可直接使用的类型

Guest、分享、Storage、插件更新、导入窗口、Surface 和歌单页区块均有 SDK 类型。类型可用不代表当前运行环境提供对应服务，请同时查看[宿主支持表](./host-services)。

| 能力                                                | SDK                                    |
| --------------------------------------------------- | -------------------------------------------- |
| storage 结构化键                                    | 直接支持共享键和 readableBy，get 空值为 null |
| ui.pluginUpdate.request                             | 直接声明更新请求与 queued 返回值             |
| ui.playlistImport.open                              | importerId 可选，支持 title                  |
| guests.import/select/remove                         | 直接提供完整 Guest 管理签名                  |
| GuestInfo / GuestBootstrapAPI                       | 从包根入口或 /guests 导入                    |
| ShareResolverEntry 等分享类型                       | 从包根入口或 /share 导入                     |
| modules.share、commands.description、Guest 展示字段 | 类型已补齐；构建器与宿主仍需支持             |
| AccountSummary / accountItems                       | 账号胶囊摘要、可选退出动作已公开             |
| NativeView / defineNativeView                       | 原生 page、actions、grid/list 已公开         |
| playlistSections / navigation sectionId             | 现有“歌单”页区块与定位已公开                 |
| 自建账号界面                                        | 使用 Vue / Web Surface；账号逻辑由插件实现   |

安装匹配版本后可直接调用，无需为这些方法另写类型转换：

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.actions.register('check-update', async () => {
    return ctx.ui.pluginUpdate.request({
      version: '0.2.0',
      url: 'https://example.com/plugin-0.2.0.js',
      notes: '这是示例地址，请替换'
    })
  })
})
```

Manifest 需声明 check-update 动作；示例不会在激活时自动请求更新。

工作台和桌面提供的运行能力不同，导入类型不会补充宿主服务。

## 自建账号与个人内容界面

登录二维码、轮询、会员信息和个人曲库数据属于插件自己的业务。登录使用 [Vue / Web Surface](./surfaces)，个人歌单通过 <code>playlistSections</code> 引用 native Surface，显示在软件现有“歌单”页。页面通过已声明的 Action 调用后台，把需要显示的状态送回页面。可运行的逐步示例见[账号与原生音乐库](./tutorial-account-native/)。

宿主提供界面容器、权限、存储、网络和音乐能力。插件负责登录服务的调用、状态流转，以及关闭页面时取消轮询。这样不同服务都使用相同的页面协议，不需要宿主为某个平台增加专门的登录分支。
