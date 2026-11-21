---
pageClass: plugin-v3-doc
title: Vue hooks、宿主组件与播放器皮肤
---

# Vue hooks、宿主组件与播放器皮肤

> **适用读者**　开发插件界面的 Vue 作者。**前置条件**　已运行 page-extension 或 player-skin。**学习目标**　选对渲染方式，复用软件组件并验证主题。预计 10 分钟。

## 选哪一种视图

| kind | 选用时机 | 框架、样式和桥接 |
| --- | --- | --- |
| `component` | 侧栏、设置、内嵌按钮、播放器皮肤 | 使用宿主 Vue、TDesign 和 SDK。普通组件挂载在 Shadow DOM；严格模式可在隔离 iframe 中运行。 |
| `web` | 完全自定义页面、React、已有 HTML 产物 | 网页在隔离环境运行，可打包自己的框架，通过 `defineSurface` 提供的桥接调用 Logic。 |
| `native` | 歌单网格、连接表单、歌曲列表等标准布局 | Logic 通过 `defineNativeView` 返回标准内容数据，宿主负责渲染和交互。 |

`page-extension` 用第一种，`vue`、`react`、`web-dist` 用第二种，`connected-library` 展示第三种。扫码弹窗是一个特例：自定义的 component 和 web 内容都在独立 iframe 内，见[登录教程](./accounts)。

## 在 Vue `<script setup>` 中调用 hooks

| Hook | 参数与返回 | 常用做法 |
| --- | --- | --- |
| `useView()` | `ViewBridge` | 取只读 `props`、`theme`、`viewId`、`instanceId`，发动作、关闭视图、登记卸载清理 |
| `useAction<Input, Output>(id)` | `(input?) => Promise<Output>` | 点击时调用；在 `try / catch` 显示失败原因；输入与结果使用 JSON |
| `useViewState<State>()` | 只读响应式引用 | Logic 用 `ctx.ui.views.setState(viewId, snapshot)` 发送显示快照；视图提供缺省值 |
| `useHostComponents()` | 当前宿主提供的组件 | 使用 `PageHeader`、`SongList` 等 |
| `useRegion(name)` | 相应区域的只读数据、尺寸、设置、动作 | 仅在已挂载到该区域的组件使用 |
| `useFrame(callback)` | 帧订阅取消函数，卸载自动取消 | 绘制区内动画，避免逐帧调用 Logic |
| `useSpectrum()` | 有频谱的区域提供的只读 `Float32Array` | 在帧回调中取样，勿修改或持久化数组 |

`useView`、`useAction`、`useViewState` 和 `useHostComponents` 来自 `@shiqianjiang/ceru-plugin-sdk/vue`。专用区域入口 `@shiqianjiang/ceru-plugin-sdk/vue/region` 可导入区域相关 hooks。把 `useView()` 放在组件 setup 中；在 Logic 或 Vue 组件外调用时不会有该视图上下文。已有 Web Vue 页面从 `SurfaceContext` 调用 `invoke`、`subscribe` 和 `close`。

视图接收来自 Logic 的最小数据。可在 `useView().onDispose` 或 Vue 卸载钩子清理自行创建的订阅、计时器与动画。Logic 要监听挂载时，使用 `ctx.ui.views.on('mounted', callback)` 或 `'unmounted'`。初学者可以像计数器那样在 Vue 的 `onMounted` 调用一个读取动作。

## 使用软件的真实组件

`component` 的工程依赖提供开发类型，构建器和宿主共同加载运行时模块。按以下方式取宿主组件，无需拷贝软件源码：

```vue
<script setup lang="ts">
import { Button } from 'tdesign-vue-next'
import { useAction, useHostComponents } from '@shiqianjiang/ceru-plugin-sdk/vue'

const refresh = useAction('refresh')
const { PageHeader } = useHostComponents()
</script>

<template>
  <PageHeader title="我的曲库" description="刷新后读取最新曲目。" />
  <Button @click="refresh()">刷新</Button>
</template>
```

在清单声明 `refresh` 并注册对应处理器后使用；完整可运行示例见[计数器](./first-plugin)。

| 组件 | 常用属性和动作 |
| --- | --- |
| `PageHeader`、`EmptyState`、`LoadingState` | 标题与空态、加载态。前两项支持 `description`。 |
| `SongList` | `items`、`label`；`actions` 可映射 `play`、`enqueue`、`favorite`、`download` 到 Logic 动作。也可用 `@play` 读取条目。只加你实现的动作。 |
| `PlaylistCard`、`PlaylistGrid` | `item` 或 `items`，通过 `@open` 收到被选中的条目。 |
| `QualityBadge`、`SourceIcon` | `quality` 或 `source`。 |
| `LyricAdapter`、`AmlLyricPlayer` | 歌词区域渲染，`@line-click` 的时间单位为毫秒。 |
| `SquareCover`、`VinylRecord`、`ShaderBackground`、`AudioVisualizer` | 封面、黑胶、背景与频谱，取当前区域公开的显示数据。 |

控件样式优先用宿主 CSS 变量，如 `--td-brand-color`、`--td-text-color-primary`、`--td-bg-color-container`。CSS 写在组件的 `<style scoped>` 内。弹层使用当前视图的 `overlay` 作为容器，可使用 SDK 的 `ViewDialog`。将弹层挂到主窗口 `document.body` 会跨出视图生命周期，导致样式或关闭状态无法跟随。

## 动手试皮肤

```sh
npx --yes create-ceru-plugin@3.0.0 my-skin --template player-skin --lang ts
cd my-skin
npm install
npm run dev
```

添加 `dist/plugin.js` 后打开全屏播放器，在「播放器个性化」选中皮肤。修改 `src/BuiltinLyrics.vue`、`src/Artwork.vue` 或 `src/Background.vue` 观察相应区域。开发者模式下，可用全屏播放器里的「皮肤模拟器」切换逐字、对唱和无歌词样例，拖动时间轴验证视图更新。

`ui.regions` 把视图绑定到 `player.lyrics@1`、`player.artwork@1`、`player.background@1`、`player.visualizer@1`、`player.songInfo@1`、`player.stage@1` 或 `desktopLyric@1`。在 `ui.skins` 组合已声明的区域。歌词和舞台区域可使用 `actions.seek(milliseconds)`。默认已有宿主过渡，可额外导出 `onEnter` / `onLeave`，尊重取消信号与减少动态效果设置。

完整属性见 [Vue bridge 类型](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/packages/sdk/src/view-contracts.ts)。区域设置、预览缩略图、动画时限与回退规则见[皮肤参考](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/docs/REGIONS-AND-SKINS.md)，原生页面布局见[Native Surface 参考](./native)。

## 验证组件从哪里来

在 `page-extension` 的 `src/Search.vue` 中找到 `useHostComponents()` 取出的 `EmptyState`，只改空态的标题。重新构建后打开搜索页，在未搜索、搜索无结果两种状态间切换。字体、间距和主题应由宿主组件绘制，模板传入的标题随状态改变。如果打开的是独立 Web 模板，需要使用它的 DOM 桥接；想复用宿主组件，检查清单的 `kind: "component"` 与构建器的组件入口。完整练习见[隔离 HTML](./web)与[封面皮肤](./skin)。
