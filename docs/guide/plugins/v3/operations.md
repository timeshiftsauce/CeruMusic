---
pageClass: plugin-v3-doc
title: 操作权限速查
---

# 操作权限速查

> **适用读者**　编写操作 Hook 或调用工具的作者。**前置条件**　已运行播放规则模板。**学习目标**　查清拦截、观察和主动调用各自的权限。预计 6 分钟。

在插件的 `manifest.uses.permissions` 声明表中的权限，用户授权后才可使用相应接口。拦截使用 `ctx.hooks.on`，完成事件使用 `ctx.events.on`（在操作名末尾加 `:done`）。可主动调用的操作见最后一列，传给 `ctx.app.call` 的 `permissionKey` 是项目给权限声明选的键。表中「宿主入口」表示该项由宿主场景触发。

时限是每个处理器的执行预算。对能调用 `next` 的处理器，等待下游执行的时间另计。输入满足 TypeScript 类型后，仍需满足每项操作的限制，例如删除歌单不能把目标换成其他歌单，歌词不能改变所属歌曲。

<table><thead><tr><th>操作</th><th>拦截权限</th><th>完成事件权限</th><th>可取消</th><th>处理器时限</th><th>主动调用权限</th></tr></thead><tbody><tr v-for="op in operations" :key="op.name"><td><code>{{ op.name }}</code></td><td>{{ op.intercept }}</td><td>{{ op.observe }}</td><td>{{ op.cancelable ? '是' : '否' }}</td><td>{{ op.timeout }} ms</td><td>{{ op.callPermission }}</td></tr></tbody></table>

输入和结果的完整 JSON Schema 见 [3.0.0 操作目录](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/docs/OPERATIONS.md)。实际宿主是否触发还取决于版本和具体调用入口。第一次写处理器按[实战教程](./hooks)练习。

<script setup>
import { data as operations } from './operations.data.mts'
</script>

## 查询每个操作的输入与结果

展开操作名，查看当前版本对应的输入和返回约束。`required` 中的字段必填，`enum` 列出允许值，`minimum`、`maximum` 等字段给出边界。输入属于本次操作；涉及私有曲目时请保留本轮句柄。只由宿主触发的操作也可以用下面的 schema 编写 Hook 测试。

<details v-for="op in operations" :key="op.name" class="details custom-block">
  <summary><code>{{ op.name }}</code> {{ op.description }}</summary>
  <p>输入</p><pre tabindex="0"><code>{{ op.input }}</code></pre>
  <p>返回</p><pre tabindex="0"><code>{{ op.output }}</code></pre>
</details>

## 实际读一行：拖动播放进度

在表中找到 `player.seek`。**拦截权限**决定能否处理用户拖动，**完成事件权限**决定能否观察最终结果，**主动调用权限**决定按钮能否发起一次跳转。“可取消”列为“否”，作者可以校正输入中的 `positionMs`，不能用取消点播的办法阻止拖动。800 ms 是该处理器的预算，把网络查询放到拖动发生以前。

若只想让用户按按钮跳到第十秒，在[API 教程](./api)按 `player.control` 实现；若要处理用户从其他入口发起的拖动，先在[Hook 模板](./hooks)写授权与撤权场景。两条路径用同一首长于十秒的本地音频复验。
