---
pageClass: plugin-v2-doc
title: 写一个命令
prev:
  text: 快速上手
  link: /guide/plugins/v2/quick-start
next:
  text: 理解搜索
  link: /guide/plugins/v2/first-search
---

# 写一个命令

<PluginLessonNav :step="1" />

接着使用上一节的 `my-plugin`。我们要让用户点击 `hello` 后，看到你写的一句话。

## 先看效果

<PluginLearningDemo mode="command" />

工作台中的 `hello` 也是这样的入口。用户点击它，插件就执行一段函数。这个入口叫**命令**，背后的函数叫**动作**。

## 修改问候内容

打开 `src/index.ts`，找到以 `ctx.actions.register('hello'` 开头的这段代码。**只替换这一段**，保留下面的搜索代码：

```ts
ctx.actions.register('hello', async () => {
  await ctx.ui.notify({
    key: 'welcome',
    level: 'info',
    message: '你好，这是我的第一个澜音插件！' // [!code highlight]
  })
})
```

保存文件，等工作台重新显示“运行中”，在左侧“能力注册”中点击 `hello`。你应该看到新的问候文字。

## 这几行在做什么？

`ctx` 是澜音交给插件的工具对象。这里用到了它的两个工具：

- `ctx.actions.register('hello', ...)`：记住“hello 对应的函数”。
- `ctx.ui.notify(...)`：让宿主显示一条提示。

`async` 和 `await` 表示这是一个会等待结果的操作。这里等待的是“发送通知”这件事完成。

`message` 是提示文字；`level: 'info'` 表示普通信息；`key: 'welcome'` 是这条通知的标识。这次练习只改 message 就够了。

## 为什么工作台里有 hello？

打开 `ceru.plugin.json`，找到：

```json
"commands": [
  {
    "id": "hello",
    "title": "Hello",
    "action": "hello"
  }
]
```

这是模板已经替你写好的**命令声明**。它告诉宿主：“这个插件有一个命令，执行时调用 hello 动作。”

<div class="plugin-reading-flow">
  <span>清单声明 <code>action: "hello"</code></span>
  <span aria-hidden="true">→</span>
  <span>代码注册 <code>register('hello', ...)</code></span>
  <span aria-hidden="true">→</span>
  <span>用户点击后执行</span>
</div>

两处 `hello` 对应同一个动作，所以名称需要一致。显示名称可以改，动作名称要对应起来。

::: details 新增第二个命令时怎么做？
同时做两件事：在 commands 数组中加入声明，再在 `definePlugin` 的回调内注册同名 action。第一次练习先沿用模板的 hello，完整字段在 [Manifest 参考](./manifest)中查询。
:::

## 动手试试

把 message 改成你自己的问候语，再把 level 改为 `'success'`。保存后重新点击 hello，观察提示的文字与样式。

**完成标志：** 你修改的文字出现在工作台中，搜索功能仍然可用。

接下来：[理解插件如何搜索 →](./first-search)
