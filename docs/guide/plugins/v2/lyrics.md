---
pageClass: plugin-v2-doc
---

# 歌词、转换器与音质

## CrLyric 标准

`tracks.lyrics` 返回 CrLyric，所有时间都是**毫秒**：

```ts
import type { CrLyric } from '@shiqianjiang/ceru-plugin-sdk'

const lyric: CrLyric = {
  format: 'crlyric',
  version: 1,
  track: {
    pluginId: 'example.library',
    providerId: 'catalog',
    kind: 'track',
    id: 'morning'
  },
  offsetMs: 0,
  lines: [
    {
      startTimeMs: 1000,
      endTimeMs: 3000,
      text: 'Morning light',
      translation: '晨光',
      words: [
        { startTimeMs: 1000, endTimeMs: 1800, text: 'Morning ' },
        { startTimeMs: 1800, endTimeMs: 3000, text: 'light' }
      ]
    }
  ]
}
```

| 字段                                     | 规则                                      |
| ---------------------------------------- | ----------------------------------------- |
| `format / version`                       | 固定 crlyric / 1                          |
| `track`                                  | ResourceRef，kind 必须是 track            |
| `offsetMs`                               | 有限数值，单位毫秒，可表达时间偏移        |
| `lines`                                  | 最多 20,000 行，按 startTimeMs 非递减排列 |
| 行 `startTimeMs / endTimeMs?`            | 非负毫秒；结束不得早于开始                |
| 行 `text / translation? / romanization?` | 文本，各项最多 65,536 个 UTF-16 代码单元  |
| 行 `words?`                              | 最多 10,000 词，按开始时间排列            |
| 词 `startTimeMs / endTimeMs / text`      | 必需，时间有效且不逆序；可含 romanization |
| 行 `isBackground? / isDuet?`             | 背景或对唱标记                            |
| `plainText?`                             | 无时间轴歌词，最多 1,048,576 个代码单元   |

没有歌词时返回合法文档 `lines: []`；有纯文本可填 plainText。不要把“歌词为空”升级成整首歌无法播放。

## 歌词转换器

平台歌词解析、解密与导出属于插件能力。Core 校验统一数据，不包含平台解析器。

在 contributes 声明：

```json
{
  "lyricConverters": [{ "id": "plain", "title": "纯文本歌词", "formats": ["plain"] }]
}
```

注册一个最小可运行转换器：

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.lyricConverters.register('plain', {
    async parse(request, operation) {
      operation.signal.throwIfAborted()
      return {
        format: 'crlyric',
        version: 1,
        track: request.track,
        offsetMs: 0,
        lines: [],
        plainText: request.text
      }
    },
    async export() {
      throw new Error('此示例不支持导出带时间轴的歌词')
    }
  })
})
```

| 方法                         | 输入                                               | 返回                         |
| ---------------------------- | -------------------------------------------------- | ---------------------------- |
| `parse(request, operation)`  | `track, format, text, translation?, romanization?` | `Promise<CrLyric>`           |
| `export(request, operation)` | `document: CrLyric, format`                        | `Promise<LyricExportResult>` |

输入格式契约包含 auto、lrc、enhanced-lrc、yrc、qrc、krc、ttml、plain；只声明自己真的支持的格式。导出格式为 lrc、enhanced-lrc、yrc，结果包含 `format, text, mime: 'text/plain', extension: 'lrc' | 'yrc'`。

Core 对转换输入/导出文本另有 **2 × 1024 × 1024 的字符串 length** 上限，单位是代码单元，不要误写为 UTF-8 的 2 MiB。

## 音质的顺序

在 Provider 声明中按**从低到高**排列：

```json
{ "qualities": ["128k", "320k", "flac", "original"] }
```

名称没有内建排名，original 也不会自动比 flac 高。歌曲的 `metadata.qualities` 用于描述该曲实际可用音质；解析时检查请求值是否受支持，缺省 quality 由你的业务选择合理默认值。

SDK 提供的音质辅助函数及参数见[类型参考](./reference#歌词与音质类型)。不要继承 v1 中固定平台音质列表作为所有 Provider 的规则。
