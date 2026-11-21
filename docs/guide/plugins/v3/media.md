---
pageClass: plugin-v3-doc
title: 歌曲引用、歌词与音质
---

# 歌曲引用、歌词与音质

> **适用读者**　编写音源与歌词转换器的作者。**前置条件**　已看过 Provider 搜索结果。**学习目标**　让歌曲、歌词和音质关联同一个资源。预计 8 分钟。

在[音源教程](./provider)跑通搜索后，点一首歌时宿主会把搜索结果里的 `ref` 传回解析器。用同一个引用也能查歌词。下面用一首自有的演示曲说明这三处如何接起来。

## 1. 为歌曲选择身份

| 歌曲来源 | 如何填写 `ref` |
| --- | --- |
| 你的私有曲库 | 填 `pluginId: ctx.plugin.id`、`providerId`、`kind: 'track'` 和库内稳定的 `id` |
| 某个已登录账号的曲库 | 在私有引用上保留当前 `connectionId`，以便切换账号后仍能识别归属 |
| 平台公开歌曲，可交给同平台其他解析器 | 使用公开的 `providerId` 和规范歌曲 ID，标记 `scope: 'provider'`，省略 `connectionId` |

列表展示用的标题、艺人、音质和时长放在 `MusicTrack`。保存歌单或传给播放器时保留整个引用，尤其是账号信息。临时试听 URL 会过期，解析时再取得。只有所属插件能收到引用里的私有 `data`。

## 2. 为提供方返回两行歌词

把以下方法放进已注册且声明歌词能力的 Provider 的 `tracks` 对象。示例歌词在第 0 秒和第 3 秒开始；每个时间字段的单位都是毫秒。

```ts
async lyrics(track) {
  return {
    format: 'crlyric',
    version: 1,
    track,
    offsetMs: 0,
    lines: [
      { startTimeMs: 0, endTimeMs: 3000, text: '第一行' },
      { startTimeMs: 3000, endTimeMs: 6000, text: '第二行' },
    ],
  }
}
```

有逐字时间时为行添加 `words`，每个词包含 `text`、`startTimeMs`、`endTimeMs`。只有纯文本时返回 `lines: []` 加 `plainText`；无歌词时返回空行数组并省略 `plainText`。开发导入或导出功能时，转换器的 `parse` 把 LRC 等文本转成 `CrLyric`，`export` 接收文档和目标格式，返回文本、MIME 和扩展名。[歌词类型和转换器签名](./reference#music)

## 3. 用清单顺序选择实际可播音质

```ts
import { selectQuality } from '@shiqianjiang/ceru-plugin-sdk/quality'

const order = ['standard', 'high', 'lossless']  // 与你的清单一致，由低到高
const available = ['standard', 'lossless']     // 这首歌实际提供的档位
selectQuality(order, available, 'high')        // 'standard'
selectQuality(order, available)                // 'lossless'
selectQuality(order, [], 'high')               // undefined
```

在 `tracks.resolve(ref, requested, operation)` 内把选中的档位交给平台客户端。没有可用档位时返回解析失败；有结果时如实填写实际音质。搜索数据的 `metadata.qualities` 也应使用同一套档位 ID。验证时分别选一个有货档位、一个缺失档位，再试完全没有资源的歌曲。

## 自测：用一首六秒钟的歌曲对时间

在 `source` 模板的 `tracks.lyrics` 中使用上面的两行歌词，准备你自己的六秒或更长的演示音频。让进度越过第 3 秒，检查当前行是否从「第一行」切到「第二行」；再拖回第 1 秒，应重新命中第一行。如果开头只闪一下便跳到末尾，检查输入时刻是否误用了秒。切换到另一首歌时返回那首歌的 `track`，并测试上一首的迟到结果不会被当前页面采用。

音质无法复现时，分别记下清单顺序、本曲 `available` 和用户所选 `requested`；用本页的 `selectQuality` 例子先算出预期档位，再比对解析器实际返回的档位。文件大小确定时以字节填写，只有平台显示文字时保留显示标签。[提供音源](./provider) · [标准数据字段](./reference#music)
