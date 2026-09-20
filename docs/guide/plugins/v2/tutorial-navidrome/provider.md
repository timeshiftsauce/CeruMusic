---
pageClass: plugin-v2-doc
title: 4. 加入搜索、播放与歌词
description: 把 Navidrome search3、stream 和歌词接口转换成澜音 Provider。
prev:
  text: Vue 连接页面
  link: /guide/plugins/v2/tutorial-navidrome/surface
next:
  text: 验证与安装
  link: /guide/plugins/v2/tutorial-navidrome/release
---

# 4. 加入搜索、播放与歌词

连接页已经可用。本节把当前账号交给 Provider，完成搜索、播放地址和同步歌词三条链路。

## 1. 声明 Provider

用下面最终内容完整替换 `ceru.plugin.json`：

```json [ceru.plugin.json]
{
  "manifest": {
    "manifestVersion": 2,
    "id": "tutorial.navidrome-vue",
    "name": "Navidrome 教程版",
    "version": "0.1.0",
    "description": "用 Vue 连接自己的 Navidrome，并提供搜索、播放与歌词",
    "author": "Your Name",
    "license": "MIT",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1",
      "uiSchema": "^1.0.0"
    },
    "modules": {
      "logic": {
        "entry": "logic.main",
        "activation": ["onCommand:connection.open", "onProvider:navidrome"]
      },
      "surfaces": [
        {
          "id": "connection",
          "kind": "web",
          "entry": "view.connection",
          "title": "连接 Navidrome",
          "presentation": { "kind": "drawer", "placement": "right", "size": 440 }
        }
      ]
    },
    "contributes": {
      "providers": [
        {
          "id": "navidrome",
          "name": "Navidrome",
          "protocols": ["music.search@1", "music.resolve@1", "music.lyrics@1"],
          "qualities": ["128k", "320k", "original"],
          "icon": { "kind": "host", "name": "server" },
          "connectionMode": "single"
        }
      ],
      "commands": [
        {
          "id": "connection.open",
          "title": "连接 Navidrome",
          "action": "connection.open",
          "view": "connection"
        },
        { "id": "connection.read", "title": "读取连接状态", "action": "connection.read" },
        { "id": "connection.save", "title": "保存连接", "action": "connection.save" },
        { "id": "connection.ping", "title": "测试连接", "action": "connection.ping" },
        { "id": "connection.logout", "title": "断开连接", "action": "connection.logout" }
      ],
      "settingsPages": [
        { "id": "connection", "title": "Navidrome 连接", "view": "connection" }
      ]
    },
    "permissions": [
      {
        "key": "navidrome.http",
        "name": "network.request",
        "reason": "访问你设置的 Navidrome 服务器"
      },
      {
        "key": "navidrome.private",
        "name": "network.private",
        "optional": true,
        "reason": "连接本机或局域网中的 Navidrome 服务器"
      }
    ],
    "dataSchemas": { "config": 1, "state": 1 }
  },
  "entries": {
    "logic.main": "src/index.ts",
    "view.connection": "src/view.ts"
  },
  "resources": {},
  "output": "dist/plugin.js",
  "framework": "vue"
}
```

Provider 声明三个协议，并把 `onProvider:navidrome` 加入激活条件。`connectionMode: single` 表示同一时间使用一条当前连接。

## 2. 实现 Provider

新建 `src/provider.ts`：

```ts [src/provider.ts]
import type {
  CrLyric,
  PluginContext,
  ProviderImplementation,
  ResourceRef
} from '@shiqianjiang/ceru-plugin-sdk'
import { api, signedUrl } from './api'
import { list, providerId, qualities, text, type Account, type Song } from './model'

function makeRef(ctx: PluginContext, current: Account, songId: string): ResourceRef {
  return {
    pluginId: ctx.plugin.id,
    providerId,
    connectionId: current.id,
    kind: 'track',
    id: `nd:${current.id}:${encodeURIComponent(songId)}`
  }
}

function songId(ctx: PluginContext, current: Account, resource: ResourceRef) {
  if (resource.pluginId !== ctx.plugin.id || resource.providerId !== providerId) {
    throw new Error('这不是本插件创建的歌曲')
  }
  const match = /^nd:([a-f0-9]{24}):(.+)$/.exec(resource.id)
  if (!match || match[1] !== current.id) throw new Error('歌曲属于另一个服务器或账号')
  return decodeURIComponent(match[2])
}

function toTrack(ctx: PluginContext, current: Account, song: Song) {
  const id = text(song.id)
  const artist = text(song.artist, '未知歌手')
  const durationMs = Math.max(0, Number(song.duration) || 0) * 1000
  if (!id) throw new Error('Navidrome 返回的歌曲缺少 id')
  return {
    ref: makeRef(ctx, current, id),
    title: text(song.title, '未知歌曲'),
    subtitle: artist,
    playable: true,
    durationMs,
    capabilities: ['music.resolve@1', 'music.lyrics@1'],
    metadata: {
      artists: [artist],
      album: song.album ? { id: text(song.albumId), title: song.album } : undefined,
      durationMs,
      qualities
    }
  }
}

export function createProvider(
  ctx: PluginContext,
  getAccount: () => Account | null
): ProviderImplementation {
  const currentAccount = () => {
    const current = getAccount()
    if (!current) throw new Error('请先打开 Navidrome 连接页并登录')
    return current
  }

  return {
    tracks: {
      async search(request, operation) {
        const current = currentAccount()
        const page = request.cursor ? Number(request.cursor) : 0
        if (!Number.isInteger(page) || page < 0) throw new Error('分页游标无效')
        const size = Math.max(1, Math.min(request.limit, 100))
        const response = await api(
          ctx,
          current,
          'search3',
          {
            query: request.query.trim(),
            artistCount: 0,
            albumCount: 0,
            songCount: size + 1,
            songOffset: page * size
          },
          operation
        )
        const songs = list(response.searchResult3?.song)
        return {
          items: songs.slice(0, size).map((song) => toTrack(ctx, current, song)),
          nextCursor: songs.length > size ? String(page + 1) : undefined
        }
      },

      async resolve(resource, quality, operation) {
        try {
          const current = currentAccount()
          const id = songId(ctx, current, resource)
          const selected = qualities.includes(quality ?? '') ? quality : 'original'
          const transcode =
            selected === 'original'
              ? { format: 'raw' }
              : { format: 'mp3', maxBitRate: Number.parseInt(selected ?? '320', 10) }
          await api(ctx, current, 'ping', {}, operation)
          return { ok: true, url: signedUrl(current, 'stream', { id, ...transcode }) }
        } catch (error) {
          const message = error instanceof Error ? error.message : '无法生成播放地址'
          const code = !getAccount()
            ? 'AUTH_REQUIRED'
            : message.includes('权限')
              ? 'PERMISSION_DENIED'
              : 'NOT_FOUND'
          return ctx.playback.failure({
            code,
            message,
            recovery: getAccount()
              ? undefined
              : {
                  mode: 'await-user',
                  actions: [
                    { kind: 'plugin-command', commandId: 'connection.open', label: '去连接' }
                  ]
                }
          })
        }
      },

      async lyrics(resource, operation) {
        const current = currentAccount()
        const id = songId(ctx, current, resource)
        const response = await api(ctx, current, 'getLyricsBySongId', { id }, operation)
        const entries = list(response.lyricsList?.structuredLyrics)
        const chosen = entries.find((entry) => entry.synced) ?? entries[0]
        const document: CrLyric = {
          format: 'crlyric',
          version: 1,
          track: resource,
          offsetMs: Number(chosen?.offset) || 0,
          lines: chosen?.synced
            ? list(chosen.line)
                .filter((line) => Number.isFinite(line.start) && typeof line.value === 'string')
                .map((line) => ({ startTimeMs: Number(line.start), text: text(line.value) }))
                .sort((a, b) => a.startTimeMs - b.startTimeMs)
            : []
        }
        if (!chosen?.synced) {
          document.plainText = list(chosen?.line)
            .map((line) => text(line.value))
            .join('\n')
        }
        return document
      }
    }
  }
}
```

搜索请求多取一首歌，用多出的结果判断是否还有下一页。Navidrome 的 `duration` 是秒，标准歌曲的 `durationMs` 是毫秒。

歌曲 ref 同时保存当前连接指纹。用户切换服务器后，旧歌曲会被拒绝，避免相同歌曲 ID 指向另一台服务器。ref 不保存 token、播放 URL 或完整响应。

播放时 `128k` 和 `320k` 请求 MP3 转码，`original` 请求原始格式。播放 URL 含认证参数，不能写入日志或长期保存。同步歌词使用接口给出的毫秒时间；无时间歌词应放入 `plainText`，不能虚构时间轴。

## 3. 注册 Provider

用下面最终内容完整替换 `src/index.ts`：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { api, createAccount, restoreAccount } from './api'
import { asRecord, storageKey, providerId, type Account, type PublicState } from './model'
import { createProvider } from './provider'

export default definePlugin(async (ctx) => {
  let account: Account | null = null
  let status = '尚未连接'

  try {
    account = restoreAccount(await ctx.storage.get(storageKey))
    if (account) status = '已载入保存的连接，等待检查'
  } catch {
    status = '保存的连接无效，请重新登录'
  }

  const publicState = (): PublicState => ({
    connected: !!account,
    status,
    serverUrl: account?.serverUrl ?? '',
    username: account?.username ?? '',
    remember: account?.remember ?? false,
    allowLocal: account?.allowLocal ?? true
  })

  const publish = async () => {
    const state = publicState()
    await ctx.ui.setState('connection', state)
    return state
  }

  ctx.actions.register('connection.open', () => ctx.ui.openView('connection'))
  ctx.actions.register('connection.read', () => publicState())

  ctx.actions.register('connection.save', async (value, operation) => {
    const candidate = createAccount(ctx, asRecord(value))
    const response = await api(ctx, candidate, 'ping', {}, operation)
    account = candidate
    status = `已连接${response.serverVersion ? ` · ${response.serverVersion}` : ''}`
    if (candidate.remember) await ctx.storage.set(storageKey, candidate)
    else await ctx.storage.delete(storageKey)
    return publish()
  })

  ctx.actions.register('connection.ping', async (_input, operation) => {
    if (!account) throw new Error('请先连接 Navidrome')
    const response = await api(ctx, account, 'ping', {}, operation)
    status = `连接正常${response.serverVersion ? ` · ${response.serverVersion}` : ''}`
    return publish()
  })

  ctx.actions.register('connection.logout', async () => {
    await ctx.storage.delete(storageKey)
    account = null
    status = '已断开，保存的令牌已清除'
    return publish()
  })

  ctx.providers.register(providerId, createProvider(ctx, () => account))
})
```

Provider 通过函数读取当前账号，因此登录、退出和 Provider 始终使用同一份内存状态。

## 4. 运行结果

保持模拟服务运行，重新执行 `npm run dev`。打开 `connection · web` 并用 `demo / demo` 登录，然后在工作台搜索 `Morning`。

预期结果：

1. 搜索返回 `Morning Light`；
2. 解析 `original` 得到 `/rest/stream.view` 地址；
3. 播放器读取到约 2 秒的 WAV 音频；
4. 歌词返回“Navidrome 教程版”和“歌词来自 OpenSubsonic 接口”两行；
5. 断开后再次解析旧歌曲，得到 `AUTH_REQUIRED` 和“去连接”动作。

常见错误：

- 搜索提示先登录：连接状态只存在当前工作台进程，重新启动后需记住登录或重新连接；
- 播放地址生成但没有声音：必须实际请求 URL，确认响应是音频，不能只把 URL 当成播放成功；
- 切换账号后旧歌曲不能播：这是连接指纹保护的预期行为；
- 转码音质不可用：真实服务器需要启用相应的 Navidrome 转码能力。

下一节：[完成验证、连接真实服务器并安装 →](./release)
