---
pageClass: plugin-v2-doc
---

# 桌面扩展与 npm 类型差异

本页记录当前 **澜音 1.14.1 桌面实现**的补充接口。CLI 工作台不会因为导入了这些类型就获得桌面功能。

## SDK 0.3.5 类型线

Guest、分享、Storage、插件更新、导入窗口、Surface 和歌单页区块类型都已进入 SDK 0.3.5 契约。完整工具链的发布状态见[0.3.5 工具链更新](./sdk-upgrade)。

| 能力                                                | SDK 0.3.5                                    |
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

Manifest 需声明 check-update 动作；示例不会在激活时自动请求更新。0.2.x 项目可暂时使用 [desktop-api.ts](/plugins/v2/examples/desktop-api.ts) 兼容声明，但不包含新 Surface 契约。

类型更新不会给旧 Host 增加运行能力，也不会使旧构建器自动接受新的 Manifest 字段。

## 自建账号与个人内容界面

登录二维码、轮询、会员信息和个人曲库数据属于插件自己的业务。登录使用 [Vue / Web Surface](./surfaces)，个人歌单通过 <code>playlistSections</code> 引用 native Surface，显示在软件现有“歌单”页。页面通过已声明的 Action 调用后台，把需要显示的状态送回页面。可运行的逐步示例见[账号与原生音乐库](./tutorial-account-native/)。

宿主提供界面容器、权限、存储、网络和音乐能力。插件负责登录服务的调用、状态流转，以及关闭页面时取消轮询。这样不同服务都使用相同的页面协议，不需要宿主为某个平台增加专门的登录分支。

## 旧账号区块协议已撤回

早期开发稿中的 `ceru.integrations` 资源，以及 accounts、homeTabs、librarySections 专用挂载方式，**已从当前宿主撤回**。不要把旧的 <code>librarySections</code> 与 0.3.5 标准 <code>contributes.playlistSections</code> 混淆。

已有实验插件应迁移到通用 Surface：清单声明页面和动作，账号使用 <code>accountItems</code>，个人歌单使用 <code>playlistSections</code>，插件通过 Provider 返回标准歌曲数据。这里保留旧协议名称仅用于识别过时示例。
