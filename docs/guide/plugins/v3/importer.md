---
pageClass: plugin-v3-doc
title: 导入一份文本歌单
---

# 导入一份文本歌单

> 面向已有音乐元数据的插件作者。完成[快速开始](./quick-start)后，预计 8 分钟。你会把两首歌的标题交给宿主建单，核对去重与显示结果。

```sh
npx --yes create-ceru-plugin@3.0.0 my-importer --template importer --lang ts
cd my-importer
npm install
npm run dev
```

## 打开宿主导入窗口

加载成品，在歌单导入窗口选择模板的文本导入器。粘贴 `晨光，夜行，晨光`。模板按中英文逗号或换行切分，去除首尾空格与空项，再按标题去重。结果应为名为「文本清单」的歌单，其中依次显示「晨光」「夜行」。

## 从输入追踪到歌曲

打开 `src/index.ts`。清单声明的导入器 ID、`ctx.playlistImporters.register('text-list', …)` 和 `ctx.ui.playlistImport.open({ importerId: 'text-list' })` 三处应一致。宿主调用 `getTracks(request, operation)` 时，作者从 `request.value` 读取输入，返回 `name`、`items` 和可选的总数估计。模板每项设置 `playable: false`，并把 `capabilities` 留空，因此可以检验导入数据，播放功能仍需绑定可用音源。

**亲手改一次**：把返回对象中的 `name: '文本清单'` 改为 `name: '晨间歌单'`，保存后重新导入另一份文本，检查新建歌单名称。已有歌单不会随模板常量重命名。

## 接入自己的歌单时

为每首歌使用平台稳定 ID，保留资源所属的 provider 与账号连接。云端分页时返回下一页游标，空结果或最后一页结束分页；把宿主传入的取消信号传给网络层。先用单页核对顺序，再测试重复标题不同 ID 的曲目，避免照搬演示数据“按标题去重”的做法。若找不到导入器，先核对清单和注册 ID；能建单却无法点播，则继续做[音源解析](./provider)。

## 把已有清单接成分页导入器

`getTracks` 的输入有三个业务字段。第一次调用时读 `value` 得到用户贴入的文本、链接或 ID，读 `limit` 确定本轮最多返回多少条。后续调用拿到 `cursor` 时，继续同一份清单。将后端返回的下一页游标放入 `nextCursor`；最后一页省略它。返回同一游标会让宿主再次请求同一页。

先在测试曲库准备三首歌，让后端每次最多返回两首。第一次返回 A、B 和下一页游标，第二次只返回 C。导入后按顺序检查 A、B、C 各出现一次。再把 B 的标题改成 A 的标题，保留它自己的 ID，重新导入另一张测试歌单。两首同名歌仍要能按资源引用分别识别。

| 你在实现哪一端 | 调用方向 | 怎样判断完成 |
| --- | --- | --- |
| 让宿主识别某个平台的分享链接 | 宿主调用你注册的 `getTracks` | 返回曲目和游标，宿主负责导入窗口与后续请求 |
| 插件已经有一组曲目，希望用户选择导入目标 | Logic 调用 `ctx.library.playlists.import` | 传同批次的 `requestId`，处理返回的 `cancelled`、`added` 和 `skipped` |

第二种流程在用户取消选择目标时应结束当前动作。对同一批次进行重试时复用原请求 ID，让宿主识别重复提交。完整参数见[曲库类型](./reference#music)与[方法索引](./methods)。
