---
pageClass: plugin-v2-doc
---

# 模板选型

CLI 提供以下 **9 种模板，每种都有 TS / JS 两个变体**。它们是可运行的最小演示，真实服务接入由你完成。

| 模板                | 适合场景           | 核心文件与演示                     | 注意事项                           |
| ------------------- | ------------------ | ---------------------------------- | ---------------------------------- |
| `source`            | 音乐搜索、播放解析 | `src/index.ts`；三条本地元数据     | 演示不可播放，解析返回 UNSUPPORTED |
| `connected-library` | 自建曲库、连接配置 | 原生歌单区块 + 设置 Schema         | 不会真的连接商业服务               |
| `importer`          | 新增歌单导入来源   | 注册 Importer，返回标准歌曲        | 保存由宿主现有导入界面完成         |
| `guest-adapter`     | 外部脚本兼容环境   | `src/guest.ts` + 父逻辑            | 不是开箱即用的完整 LX 兼容实现     |
| `web-surface`       | 普通 DOM 页面      | `src/view.ts`、CSS                 | 页面通过动作桥调用后台             |
| `vue`               | Vue SFC 界面       | `App.vue`、`view.ts`               | 编译 SFC、scoped CSS               |
| `vue-tsx`           | Vue JSX/TSX 界面   | `App.tsx`、`view.ts`               | JS 变体使用 JSX                    |
| `react`             | React 界面         | `App.tsx`、`view.tsx`              | Hooks 与 ReactDOM root             |
| `web-dist`          | 封装已构建静态网页 | `web-dist/index.html`、JS/CSS/图片 | 不能依赖运行中的服务端             |

## 如何选择

- 只需要数据能力：先用 `source`，后续再添加界面。
- 简单连接参数：使用[原生配置抽屉](./ui-schema)，由澜音渲染控件。
- 需要复杂交互：选择熟悉的 Vue/React，或普通 DOM。
- 已有静态网页产物：选择 `web-dist`，检查所有资源能否本地打包。
- 接入旧格式脚本：选择 `guest-adapter`，实现格式与协议适配。

## 创建命令

```shell
npm create ceru-plugin@latest my-source -- --template source --lang ts
npm create ceru-plugin@latest my-vue -- --template vue --lang ts
npm create ceru-plugin@latest my-react -- --template react --lang js
```

进入工程后运行 `npm install`、`npm run dev`。TS 和 JS 都通过同一套 CLI 打包；JS 工程可使用 JSDoc 与 SDK 类型提示。

## 桌面与工作台的界面差异

工作台能预览 Schema、Web 和 native Surface。<code>connected-library</code> 模板通过 <code>playlistSections</code> 把 native Surface 放入澜音现有“歌单”页，并用 <code>navigation.open({ page: 'playlist', sectionId })</code> 定位，不打开个人歌单抽屉。

澜音 2.0 桌面将 Schema Surface 按[抽屉格式](./ui-schema)读取：`presentation.kind: 'drawer'`、表单根节点及支持的控件缺一不可。

因此 `connected-library`、`importer`、`guest-adapter` 等模板里的普通设置 Schema，不能不加调整就当作桌面原生抽屉。保持数据能力不变，按抽屉章节补充 presentation、submitAction 与控件声明。

Web Surface 由宿主在通用隔离容器中挂载，可以按 Manifest presentation 配置为抽屉或 modal。容器会按页面自然内容高度调整容器；根元素避免 100vh。声明了 `uiExtensions` 或全局样式，并不意味着 2.0 已在主界面实现所有 Slot，参见[支持状态](./host-services)。

## web-dist 支持范围

支持本地 HTML、模块脚本、CSS、普通图片及字体。当前不支持远端脚本、HTML 内联事件、`srcset` 或需要独立服务器的页面。先把网站构建成静态产物，再交给插件 CLI。

## 模板源码与贡献

[模板仓库](https://github.com/CeruMusic/CeruMusic-Plugin-Template/tree/main/templates)中的 `templates/<模板>/ts`、`js` 是源码，不是安装文件。创建时 `_gitignore` 会还原为 `.gitignore`。

改进模板请遵循仓库 [CONTRIBUTING.md](https://github.com/CeruMusic/CeruMusic-Plugin-Template/blob/main/CONTRIBUTING.md)。CLI 使用固定快照，手动下载的最新模板可能与当前 CLI 有差异。
