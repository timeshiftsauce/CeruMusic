---
pageClass: plugin-v2-doc
title: 保存数据
prev:
  text: 理解搜索
  link: /guide/plugins/v2/first-search
next:
  text: 安装与交付
  link: /guide/plugins/v2/first-release
---

# 保存数据

<PluginLessonNav :step="3" />

现在让 hello 命令记住执行过多少次。以后保存用户偏好，也可以使用同一组 API。

## 先试着点几次

<PluginLearningDemo mode="storage" />

“visits”是我们给这条记录起的名字；它对应一个数字。你可以把插件存储理解为一个默认只有自己能读写的小字典。

## 替换 hello 动作

回到 `src/index.ts`，找到之前修改过的 `ctx.actions.register('hello', ...)`。用下面这一整段替换它，保留 tracks 和 Provider 代码：

```ts
ctx.actions.register('hello', async () => {
  const previous = await ctx.storage.get<number>('visits')
  const visits = (previous ?? 0) + 1

  await ctx.storage.set('visits', visits)

  await ctx.ui.notify({
    key: 'welcome',
    level: 'info',
    message: '这是第 ' + visits + ' 次问候'
  })
})
```

保存后，在工作台连续执行两次 hello。提示应依次为“这是第 1 次问候”和“这是第 2 次问候”。

## 读、改、写

`get('visits')` 读取旧值。第一次没有记录，`previous ?? 0` 就把空值当成 0。`<number>` 是 TypeScript 提示：我们预期这里保存的是数字；它不会自动转换错误的数据。

接着加 1，并通过 `set('visits', visits)` 保存。两次使用相同的键名 visits，才能读到刚才写入的记录。

<div class="plugin-reading-flow">
  <span><code>get('visits')</code><br />读旧值</span>
  <span aria-hidden="true">→</span>
  <span><code>(previous ?? 0) + 1</code><br />计算新值</span>
  <span aria-hidden="true">→</span>
  <span><code>set('visits', visits)</code><br />保存</span>
</div>

这三个操作放在同一个动作里。示例请一次点一下，等提示出现再点下一次；并发执行的“读取再写入”不是一个自动加锁的事务。

## 重启后还能读到吗？

在**澜音桌面**中，storage 会保存到本地，退出重开或停用再启用后仍然存在，卸载插件时清除。

从工具链 **0.3.3** 起，CLI 工作台也会把本插件数据保存到工程的 `.ceru-dev/storage` 中。停止开发服务再启动，执行 hello 应继续上次的计数。清除这份开发缓存会清除测试数据。

工作台数据与澜音桌面的已安装插件数据互相独立；把成品安装到桌面，不会把你的开发计数一起带过去。

每个桌面插件的总容量是 **10 MiB**。小型偏好和计数很适合放在这里；歌曲文件不适合。详细计量方式、键名限制和共享读取见 [Storage 参考](./storage)。

## 动手试试

在上面的 `get` 之前临时加一行：

```ts
await ctx.storage.delete('visits')
```

再执行 hello，它会一直显示第 1 次，因为你每次都先清除了记录。观察后**删除这行临时代码**，再保存。

**完成标志：** 你能分别用 get、set 和 delete 读取、保存和清除一个值，并能重启开发工作台验证计数保留，理解它与桌面数据分开存放。

接下来：[把这个插件安装到澜音 →](./first-release)
