# 练习计数器

使用 Node.js 22.12 或更高版本：

```sh
npx --yes create-ceru-plugin@3.0.0 ceru-counter --template page-extension --lang ts
cd ceru-counter
npm install
```

用本示例的 `ceru.plugin.json` 和 `src/index.ts` 替换工程同名文件，并新增
`src/Counter.vue`。可删除模板原来的 `src/Search.vue` 和 `src/Open.vue`。

运行 `npm run dev`。在支持 v3 的澜音 2.5.0 测试构建中打开
「设置 → 插件管理 → 管理设置 → 插件开发者模式」，添加打印的
`dist/plugin.js`，然后从侧栏打开「练习计数器」。点击「加一」，关闭再打开页面，
以及重启桌面后重新添加同一个成品路径，核对次数是否保留。

准备分发时，停止 dev，运行 `npm run check:compat`、`npm run typecheck`、
`npm run build`、`npm run validate`。在普通插件管理中安装成品并单独测试。
开发预览与正式安装应各自验证，使用各自的测试数据。
