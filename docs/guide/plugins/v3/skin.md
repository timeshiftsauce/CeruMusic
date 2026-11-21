---
pageClass: plugin-v3-doc
title: 制作能跟随播放状态的封面皮肤
---

# 制作能跟随播放状态的封面皮肤

> 适合已经写过 Vue 组件的作者。准备可在桌面播放的一首本地歌曲，预计 10 分钟。目标是在播放界面选择自己的封面，再切回内置封面。

```sh
npx --yes create-ceru-plugin@3.0.0 my-skin --template player-skin --lang ts
cd my-skin
npm install
npm run dev
```

## 从封面区域开始

添加成品，播放一首本地歌曲，打开播放界面右下角的「个性化」，选中模板提供的封面。查看 `ceru.plugin.json` 中的区域与视图绑定，再打开 `src/Artwork.vue`。`useRegion('player.artwork')` 给这个封面实例提供曲目、封面、调色板、布局和播放状态，`useHostComponents()` 提供软件内部的 `VinylRecord` 与 `SquareCover`。

在模板的 `<template>` 中，将已有两个组件外层包在 `<div class="cover-frame">` 内，在文件末尾加入：

```vue
<style scoped>
.cover-frame {
  box-sizing: border-box;
  padding: 4px;
  border: 2px solid var(--td-brand-color);
  border-radius: 12px;
}
</style>
```

保留模板的布局判断及传给宿主组件的 props。保存后，选中该皮肤时应看到有主题色边框的封面。切换 CD 与方形布局，分别观察两种软件组件；暂停、继续和切歌后确认歌曲与封面一起更新。

## 检查切换和性能

切回内置封面，边框应消失，个性化按钮与外层面板的样式应保留。用区域帧回调处理需要动画的视觉变化，避免每帧向 Logic 发送动作。离开区域时解除自己创建的监听。若条目可选却没有效果，先查 region 名和视图映射，再看是否选中了正确区域或触发了宿主回退。[区域数据与 Vue hooks](./views) · [完整类型](./reference#views)
