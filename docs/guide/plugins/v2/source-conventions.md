---
pageClass: plugin-v2-doc
title: 音源命名约定
---

# 音源命名约定

接入常见音乐平台时，推荐使用下面的平台和音质标识，方便开发者使用一致的名称。**这些是约定，不是强制枚举；插件可以使用自己的标识，也不必支持列表中的所有平台或音质。**

## 平台标识

| 平台        | 推荐标识 |
| ----------- | -------- |
| 哔哩哔哩    | `bili`   |
| QQ 音乐     | `tx`     |
| 网易云音乐  | `wy`     |
| 酷狗音乐    | `kg`     |
| 酷我音乐    | `kw`     |
| 咪咕音乐    | `mg`     |
| 汽水音乐    | `qs`     |
| Apple Music | `apple`  |

在 v2 插件中，可以把对应标识用作 Provider ID。例如接入 QQ 音乐时，这三处统一使用 `tx`：

- 清单中 `manifest.contributes.providers` 对应项的 `id`。
- 注册方法的 `ctx.providers.register('tx', ...)`。
- 返回歌曲引用中的 `ref.providerId`。

插件自己的 `manifest.id` 和 `ref.pluginId` 仍使用本插件的 ID，例如 `example.qq-source`，不需要改成平台缩写。相同的平台标识也不意味着不同插件的歌曲引用可以直接互换。

自建音乐服务或不在表中的平台可以自行命名。教程里的 `catalog`、`tutorial-source` 就是自定义 Provider ID。

## 音质标识

推荐使用以下写法：

```json
["128k", "320k", "flac", "flac24bit", "hires", "atmos", "atmos_plus", "master"]
```

按实际支持情况选取即可。例如服务只提供普通、高品质和无损三档，Provider 声明中可以写：

```json
{ "qualities": ["128k", "320k", "flac"] }
```

这几个位置使用同一套标识：

| 位置                                                        | 表达什么                             |
| ----------------------------------------------------------- | ------------------------------------ |
| Provider 的 `qualities`                                     | 这个音源支持哪些音质，按从低到高排列 |
| 歌曲的 `metadata.qualities`                                 | 这首歌实际提供哪些音质               |
| `tracks.resolve(resource, quality, operation)` 的 `quality` | 本次请求解析哪一档                   |

名称本身不会建立全局排名，实际顺序以 Provider 的声明为准。也不要为了凑齐推荐列表而声明服务没有提供的音质。

这些字符串是插件使用的档位标识，不代表上游接口一定接受同名参数；插件需要将它们映射到服务实际要求的参数。自定义标识同样可用，例如 HTTP 教程用 `lossless` 表示其生成的 WAV 音频。

数据结构见 [Provider 与标准数据](./providers)，音质顺序与默认值见[歌词与音质](./lyrics#音质的顺序)。
