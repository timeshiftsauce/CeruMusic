# CeruMusic UI Modernization Plan

> **目标**：在保留 `Electron + Vue + Pinia + TDesign` 主栈的前提下，重构主壳层视觉语言、页面切换动画与播放器质感，让应用更现代、更有识别度，同时避免增加明显的渲染负担。

## 视觉方向

- 方向名称：`Aurora Glass`
- 关键词：层次感、玻璃雾面、霓虹流光、唱片感、轻动效
- 主色策略：保留现有品牌绿，但把它从“纯主题色”升级为“氛围光源”
- 明暗主题：
  - 亮色：偏雾白 + 浅绿辉光 + 柔和阴影
  - 暗色：偏石墨黑 + 绿蓝冷光 + 半透明玻璃层

## 首批改造范围

### 1. App 与 HomeLayout

- 替换当前基于 `animate.css` 的整页淡入淡出
- 引入更顺滑的 `opacity + translate + blur + scale` 复合切场
- 为主壳层增加背景氛围层、玻璃侧栏、悬浮顶栏和更强的空间层级
- 保持现有功能结构不变，不改路由语义

### 2. 播放器

- 重构底部播放器的背景、边框、高光、按钮质感和进度条反馈
- 控制动效统一收敛到一套 easing / duration token
- 保留现有交互和快捷能力，不改播放行为

### 3. 主题与全局 token

- 抽出新的 motion token 与 shell token
- 把页面背景、边框、阴影、毛玻璃、辉光统一到全局变量
- 后续页面局部美化继续复用，不再在页面里分散硬编码

## 实施顺序

1. 先改 `App.vue`、`views/home/index.vue`、`components/layout/HomeLayout.vue`
2. 再改 `assets/main.css`，补新的视觉和动效 token
3. 再改 `components/Play/PlayMusic.vue`
4. 最后跑 `jest`、`tsc`、`vue-tsc`、`electron-vite build`

## 风险控制

- 不引入新 UI 库
- 不改业务数据流
- 不把大动画绑定到滚动列表项，避免造成卡顿
- 过渡动画优先使用 `transform`、`opacity`、`filter`，避免频繁触发布局

## 本轮验收标准

- 首页壳层视觉明显升级
- 页面切换不再是生硬的整页闪切或普通淡入淡出
- 底部播放器有更强的现代感和沉浸感
- 类型检查和构建保持通过

## 本轮已完成

- `App.vue` 改为 `app-shell` 过渡，主壳层切换不再依赖 `animate.css`
- `views/home/index.vue` 改为 `home-scene / home-detail` 双轨切换，列表页与详情页过渡更自然
- `assets/main.css` 新增 motion token、shell token 与全局背景氛围
- `HomeLayout.vue` 改为玻璃侧栏 + 浮动头部 + 主舞台容器的新布局
- `PlayMusic.vue` 与 `TitleBarControls.vue` 完成第一轮视觉统一
- `HomeLayout.vue` 第二轮补上侧栏折叠、自适应修正与搜索栏焦点收口
- `find/search/local/recent/list/songlist/settings` 全部接入统一的页面舞台卡片体系
- `find / songlist / list / settings` 已完成第一轮页内深改，卡片层级、筛选区、头图区和 section 切换动效已进入统一语言

## 验证记录

- `node node_modules/jest/bin/jest.js --runInBand`
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false`
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false`
- `node node_modules/electron-vite/bin/electron-vite.js build`
