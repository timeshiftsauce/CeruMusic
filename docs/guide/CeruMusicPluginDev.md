# CeruMusic 插件开发指南

## 概述

CeruMusic 支持两种类型的插件：

1. **CeruMusic 原生插件**：基于 CeruMusic API 的插件格式
2. **LX 兼容插件**：兼容 LX Music 的事件驱动插件格式

本文档将详细介绍如何开发这两种类型的插件。

## 文件要求

- **编码格式**：UTF-8
- **编程语言**：JavaScript (支持 ES6+ 语法)
- **文件扩展名**：`.js`

## 插件信息注释

所有插件文件的开头必须包含以下注释格式：

```javascript
/**
 * @name 插件名称
 * @description 插件描述
 * @version 1.0.0
 * @author 作者名称
 * @homepage https://example.com
 */
```

### 注释字段说明

- `@name`：插件名称，建议不超过 24 个字符
- `@description`：插件描述，建议不超过 36 个字符（可选）
- `@version`：版本号（可选）
- `@author`：作者名称（可选）
- `@homepage`：主页地址（可选）

---

## CeruMusic 原生插件开发

首先 `澜音` 插件是面向 方法的 这意味着你直接导出方法即可为播放器提供音源

### 基本结构

```javascript
/**
 * @name 示例音乐源
 * @description CeruMusic 原生插件示例
 * @version 1.0.0
 * @author CeruMusic Team
 */

// 插件信息
const pluginInfo = {
  name: "示例音乐源",
  version: "1.0.0",
  author: "CeruMusic Team",
  description: "这是一个示例插件"
};

// 支持的音源配置
const sources = {
  kw:{
    name: "酷我音乐",
    qualitys: ['128k', '320k', 'flac', 'flac24bit']
  },
  tx:{
    name: "QQ音乐",
    qualitys: ['128k', '320k', 'flac']
  }
};

// 获取音乐链接的主要方法
async function musicUrl(source, musicInfo, quality) {
  try {
    // 使用 cerumusic API 发送 HTTP 请求
    const result = await cerumusic.request('https://api.example.com/music', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        ...你的其他参数 可以 是密钥或者其他...
      },
      body: JSON.stringify({
        id: musicInfo.id, // 兼容1.8.6版本之前最好使用 songmid || hash 否则会报错
        // id: musicInfo.songmid || musicInfo.hash
        qualitys: quality
      })
    });

    if (result.statusCode === 200 && result.body.url) {
      return result.body.url;
    } else {
      throw new Error('获取音乐链接失败');
    }
  } catch (error) {
    console.error('获取音乐链接时发生错误:', error);
    throw error;
  }
}

// 获取歌曲封面（可选）
async function getPic(source, musicInfo) {
  try {
    const result = await cerumusic.request(`https://api.example.com/pic/${musicInfo.id}`);
    return result.body.picUrl;
  } catch (error) {
    throw new Error('获取封面失败: ' + error.message);
  }
}

// 获取歌词（可选）
async function getLyric(source, musicInfo) {
  try {
    const result = await cerumusic.request(`https://api.example.com/lyric/${musicInfo.id}`);
    return result.body.lyric;
  } catch (error) {
    throw new Error('获取歌词失败: ' + error.message);
  }
}

// 导出插件
module.exports = {
  pluginInfo,
  sources,
  musicUrl,
  getPic,    // 可选
  getLyric   // 可选
};
```

> #### PS
>
> - `sources key` 取值
>   - wy 网易云音乐 |
>   - tx QQ音乐 |
>   - kg 酷狗音乐 |
>   - mg 咪咕音乐 |
>   - kw 酷我音乐
> - 导出
>
>   ```javascript
>   module.exports = {
>     sources // 你的音源支持
>   }
>   ```
>
> - 支持的音质 `sources.qualitys: ['128k', '320k', 'flac']`
>   - `128k`: 128kbps
>   - `320k`: 320kbps
>   - `flac`: FLAC 无损
>   - `flac24bit`: 24bit FLAC
>   - `hires`: Hi-Res 高解析度
>   - `atmos`: 杜比全景声
>   - `master`: 母带音质

### 澜音格式详解与进阶

#### 核心导出约定

- 以 CommonJS 形式导出方法集合：
- 必需：`pluginInfo`、`sources`、`musicUrl`
- 可选：`getPic`、`getLyric`
- `pluginInfo` 与文件头注释一致，用于在插件管理界面展示
- `sources` 用于声明支持的音源及音质

```javascript
module.exports = {
  pluginInfo: {
    name: '示例音乐源',
    version: '1.0.0',
    author: 'you',
    description: '示例'
  },
  sources: {
    kw: { name: '酷我音乐', qualitys: ['128k', '320k', 'flac', 'flac24bit'] },
    tx: { name: 'QQ音乐', qualitys: ['128k', '320k', 'flac'] }
  },
  async musicUrl(source, musicInfo, quality) {
    /* ... */
  },
  async getPic(source, musicInfo) {
    /* ... */
  },
  async getLyric(source, musicInfo) {
    /* ... */
  }
}
```

#### 方法签名与数据结构

- `musicUrl(source, musicInfo, quality)`
  - `source`: 音源 ID（`kw`、`tx`、`kg`、`wy`、`mg`、`local`）
  - `musicInfo`: 歌曲信息对象，优先使用 `id`；为兼容 ≤1.8.6 可回退 `songmid` 或 `hash`
  - `quality`: 期望音质字符串（如 `'320k'`、`'flac'`、`'flac24bit'`）
  - 返回：可播放直链字符串
- `getPic(source, musicInfo)`
  - 返回：封面图片 URL 字符串
- `getLyric(source, musicInfo)`
  - 返回：歌词字符串

质量映射示例（当第三方 API 使用不同枚举时）：

```javascript
const qualityMap = {
  kw: { '128k': '128', '320k': '320', flac: 'flac', flac24bit: 'flac24bit' },
  tx: { '128k': '128', '320k': '320', flac: 'flac' }
}
```

#### 最小可用模板

```javascript
/**
 * @name 示例音乐源
 * @description CeruMusic 原生插件最小模板
 */

const pluginInfo = {
  name: '示例音乐源',
  version: '1.0.0',
  author: 'you',
  description: '最小模板'
}

const sources = {
  kw: { name: '酷我音乐', qualitys: ['128k', '320k', 'flac'] },
  tx: { name: 'QQ音乐', qualitys: ['128k', '320k', 'flac'] }
}

const qualityMap = {
  kw: { '128k': '128', '320k': '320', flac: 'flac' },
  tx: { '128k': '128', '320k': '320', flac: 'flac' }
}

async function musicUrl(source, musicInfo, quality) {
  const id = musicInfo.id || musicInfo.songmid || musicInfo.hash
  if (!id) throw new Error('音乐信息不完整')
  const endpoint =
    source === 'kw' ? 'https://api.example.com/kw/url' : 'https://api.example.com/tx/url'
  const resp = await cerumusic.request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, quality: qualityMap[source]?.[quality] ?? quality }),
    timeout: 10000
  })
  if (resp.statusCode !== 200 || !resp.body?.url) throw new Error('获取音乐链接失败')
  return resp.body.url
}

async function getPic(source, musicInfo) {
  const id = musicInfo.id || musicInfo.songmid || musicInfo.hash
  const resp = await cerumusic.request(`https://api.example.com/${source}/pic/${id}`, {
    timeout: 10000
  })
  return resp.body.picUrl
}

async function getLyric(source, musicInfo) {
  const id = musicInfo.id || musicInfo.songmid || musicInfo.hash
  const resp = await cerumusic.request(`https://api.example.com/${source}/lyric/${id}`, {
    timeout: 10000
  })
  return resp.body.lyric
}

module.exports = { pluginInfo, sources, musicUrl, getPic, getLyric }
```

#### 进阶：鉴权、签名、缓存与重试

- 使用加密工具进行签名或生成随机数：

```javascript
function signPayload(payload, secret) {
  const base = JSON.stringify(payload) + secret
  return cerumusic.utils.crypto.md5(base)
}
```

- 简易请求缓存与超时控制：

```javascript
const cache = new Map()

async function cachedMusicUrl(source, musicInfo, quality, ttl = 300000) {
  const id = musicInfo.id || musicInfo.songmid || musicInfo.hash
  const key = `${source}:${id}:${quality}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < ttl) return hit.url
  const resp = await cerumusic.request('https://api.example.com/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, quality }),
    timeout: 10000
  })
  if (resp.statusCode !== 200 || !resp.body?.url) throw new Error('获取音乐链接失败')
  cache.set(key, { url: resp.body.url, t: Date.now() })
  return resp.body.url
}
```

- 失败重试（指数退避）示例：

```javascript
async function withRetry(fn, max = 3) {
  let attempt = 0
  while (attempt < max) {
    try {
      return await fn()
    } catch (e) {
      attempt++
      if (attempt >= max) throw e
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)))
    }
  }
}
```

#### 安装与调试

- 将插件保存为 UTF-8 编码的 `.js` 文件
- 在 设置 → 插件管理 中导入插件文件
- 在 插件管理 → 日志 查看调试输出
- 使用 `cerumusic.NoticeCenter('update', ...)` 推送更新提示

#### 最佳实践清单

- 优先使用 `musicInfo.id`，并兼容旧字段 `songmid`、`hash`
- 严格校验返回结构与状态码，抛出明确错误信息
- 按音源维护质量映射，避免提交无效音质
- 对热点接口增加缓存与超时，必要时重试
- 不记录或上传敏感信息；日志中对密钥脱敏

### 插件宿主与运行时

#### 生命周期

- 加载：读取 `.js` 文件代码并在沙箱中执行（Node VM）
- 校验：必须导出 `pluginInfo`、`sources`、`musicUrl`
- 初始化：注入 `cerumusic` API、`Buffer`、`JSON`、计时器函数等必要对象
- 调用：通过宿主统一调用 `musicUrl/getPic/getLyric` 并进行异常捕获与日志记录
- 卸载：删除插件文件并清理内存中的实例

#### 沙箱环境与安全

- 全局可用对象：`cerumusic`、`console`、`setTimeout/clearTimeout`、`setInterval/clearInterval`、`Buffer`、`JSON`
- 禁止直接 `require` 外部模块（由宿主注入空实现）
- `cerumusic.utils.crypto` 支持：
  - AES 模式：`aes-128-cbc`、`aes-128-ecb`
  - `md5`、`randomBytes`、`rsaEncrypt(PKCS1, PEM公钥)`
  - `buffer.from/bufToString` 支持 `utf8/hex/base64` 编码

#### 请求模型与行为

- 默认超时：10 秒（可通过 options.timeout 覆盖）
- 支持 Promise 和回调两种调用方式
- 响应解析：
  - `application/json` 自动解析为对象
  - `text/*` 解析为字符串
  - 其他类型先尝试 JSON，失败则返回文本
- 错误返回统一结构：

```javascript
{
  statusCode: 408 | 500,
  headers: {},
  body: {
    error: 'RequestError' | 'AbortError',
    message: '错误信息',
    url: '请求的URL'
  }
}
```

#### 插件方法调用契约

- 宿主调用时会：
  - 对 `musicUrl` 自动兼容旧字段：当 `musicInfo.id` 缺失时回退 `songmid/hash`
  - 捕获异常并封装为统一错误，记录日志；`musicUrl` 失败时额外记录堆栈
- 插件返回值：
  - `musicUrl`：必须返回可播放直链（string）
  - `getPic`：返回封面 URL（string）
  - `getLyric`：返回歌词文本（string）

#### 插件信息与 sources 结构

- `pluginInfo` 必须包含 `name/version/author`，可选 `description`
- `sources` 推荐使用“音源ID到配置”的映射对象：

```javascript
{
  kw: { name: '酷我音乐', qualitys: ['128k', '320k', 'flac'] },
  tx: { name: 'QQ音乐', qualitys: ['128k', '320k', 'flac'] }
}
```

- 字段命名：当前 UI/转换器均使用 `qualitys`（注意拼写），请保持一致；如第三方接口要求不同枚举可使用质量映射

#### 通知中心（NoticeCenter）

- 类型：`error`、`info`、`success`、`warn`、`update`
- 字段：
  - `title` 必填；`content/url/version/pluginInfo` 可选
  - `pluginInfo.type` 必须为 `cr` 或 `lx`
- 用途：版本更新提醒、重要错误或告警提示

#### 日志与观测

- 每个插件拥有独立日志文件，路径：`AppDir/plugins/logs/<pluginId>.txt`
- 获取日志会返回最近 200 行，并进行文件截断保留
- 日志级别：`log/info/warn/error/group/groupEnd`
- 插件调用链路会记录请求耗时和状态，便于定位问题

#### 插件管理与存储

- 安装来源：
  - 本地选择文件：会进行格式关键字校验（澜音需包含 `cerumusic`，洛雪需包含 `lx`）
  - URL 下载：30 秒下载超时，空文件拒绝
  - LX 事件驱动插件将自动转换为澜音方法格式
- 文件命名：`<pluginId>-<safeFileName>`，`pluginId` 为 UUID（去连字符），名称字符非法将替换为 `_`
- 重复检查：同名同版本不允许重复安装

#### 错误与异常约定

- 请求级错误：返回 408/500，附带错误信息（见“请求模型与行为”）
- 方法未实现：抛出 `Action "xxx" is not implemented`，宿主封装为统一错误
- 业务级错误：插件需抛出明确错误文本，宿主会记录并提示
- 建议为关键链路实现重试与降级（参考进阶示例）

### CeruMusic API 参考

#### cerumusic.request(url, options)

HTTP 请求方法，返回 Promise。

**参数：**

- `url` (string): 请求地址
- `options` (object): 请求选项
  - `method`: 请求方法 (GET, POST, PUT, DELETE 等)
  - `headers`: 请求头对象
  - `body`: 请求体
  - `timeout`: 超时时间（毫秒）

**返回值：**

```javascript
{
  statusCode: 200,
  headers: {...},
  body: {...}  // 自动解析的响应体
}
```

#### cerumusic.utils

工具方法集合：

```javascript
// Buffer 操作
cerumusic.utils.buffer.from(data, encoding)
cerumusic.utils.buffer.bufToString(buffer, encoding)

// 加密工具
cerumusic.utils.crypto.md5(str)
cerumusic.utils.crypto.randomBytes(size)
cerumusic.utils.crypto.aesEncrypt(data, mode, key, iv)
cerumusic.utils.crypto.rsaEncrypt(data, key)
```

#### cerumusic.NoticeCenter(type, data)

发送通知到用户界面：

```javascript
cerumusic.NoticeCenter('info', {
  title: '通知标题',
  content: '通知内容',
  url: 'https://example.com', // 可选 当通知为update 版本跟新可传
  version: '版本号', // 当通知为update 版本跟新可传
  pluginInfo: {
    name: '插件名称',
    type: 'cr' // 固定唯一标识
  } // 当通知为update 版本跟新可传
})
```

**通知类型：**

- `'info'`: 信息通知
- `'success'`: 成功通知
- `'warn'`: 警告通知
- `'error'`: 错误通知
- `'update'`: 更新通知

### 插件示例

```javascript
/*!
 * @name 澜音源
 * @description 澜音插件 支持酷我，网易，咪咕平台最高flac
 * @version v4.0.0
 * @author 时迁酱
 * @homepage https://example.com
 */

// 插件信息
const pluginInfo = {
  name: '澜音源',
  version: 'v4.0.0',
  author: '时迁酱',
  description: '澜音插件 支持酷我，网易，咪咕平台最高flac',
  updateMd5: '6cd9d36abc88c641032e483b58c9ec90',
  apiKey: '',
  type: 'cr'
}

// 支持的音源配置
const sources = {
  kw: {
    name: '酷我音乐',
    qualitys: ['128k', '320k', 'flac']
  },
  mg: {
    name: '咪咕音乐',
    qualitys: ['128k', '320k', 'flac']
  },
  wy: {
    name: '网易云音乐',
    qualitys: ['128k', '320k', 'flac']
  }
}
// api 地址
const apiUrl = ''
// 获取工具函数
const { request, NoticeCenter } = cerumusic

// 插件名格式化 修饰
function pluginName(source) {
  return `[${pluginInfo.name} <${sources[source].name}>]`
}

// 获取音乐链接的主要方法
async function musicUrl(source, musicInfo, quality) {
  console.log('收到解析请求', '-------------不优雅的分割线-------------')
  try {
    // 检查source是否有效
    if (!sources[source]) {
      throw new Error(`无效的音源: ${source}`)
    }

    // 检查quality是否有效
    if (!sources[source].qualitys.includes(quality)) {
      throw new Error(`无效的音质: ${quality}，支持的音质: ${sources[source].qualitys.join(', ')}`)
    }

    const songId = musicInfo.hash ?? musicInfo.songmid ?? musicInfo.id

    if (!songId) {
      throw new Error('音乐ID不存在')
    }
    console.log(`${pluginName(source)} 请求音乐链接: 歌曲ID: ${songId}, 音质: ${quality}`)
    // 使用 cerumusic API 发送 HTTP 请求
    const result = await request(
      `${apiUrl}/music/url?source=${source}&songId=${songId}&quality=${quality}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': pluginInfo.apiKey,
          'User-Agent': `CeruMusic-Plugin/${pluginInfo.version}`
        },
        timeout: 15000
      }
    )
    console.info(`${pluginName(source)} 请求响应数据:`, result.body)
    console.log(`${pluginName(source)} 请求结束，响应状态码: ${result.statusCode}`)
    if (result.statusCode === 200 && result.body && result.body.code === 200) {
      if (result.body.url) {
        console.log(
          `${pluginName(source)} 获取音乐链接成功: ${songId}, 音质: ${quality}, 链接: ${result.body.url}`
        )
        return result.body.url
      } else {
        throw new Error('返回数据中没有音乐链接')
      }
    } else if (result.body && result.body.code) {
      switch (result.body.code) {
        case 403:
          // 发送错误通知
          NoticeCenter('error', {
            title: '音乐链接获取失败',
            content: `来源: ${pluginName(source)}, 错误: API Key失效或鉴权失败`
          })
          throw new Error('API Key失效或鉴权失败')
        case 429:
          NoticeCenter('error', {
            title: '音乐链接获取失败',
            content: `来源: ${pluginName(source)}, 错误: 请求过于频繁，请稍后再试`
          })
          throw new Error('请求过于频繁，请稍后再试')
        case 500:
          throw new Error(`服务器错误: ${result.body.message || '未知错误'}`)
        default:
          cerumusic.NoticeCenter('error', {
            title: '音乐链接获取失败',
            content: `来源: ${pluginName(source)}, 错误: API错误 ${result.body.message || '未知错误'}`
          })
          throw new Error(`API错误: ${result.body.message || '未知错误'}`)
      }
    } else {
      throw new Error(`HTTP请求失败: ${result.statusCode}`)
    }
  } catch (error) {
    console.error(`${pluginName(source)} 获取音乐链接失败:`, error.message)
    throw new Error(error.message ?? error)
  }
}

const checkUpdate = async () => {
  try {
    const { body } = await request(
      `${apiUrl}/script?checkUpdate=${pluginInfo.updateMd5}&key=${pluginInfo.apiKey}&type=${pluginInfo.type}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `CeruMusic-Plugin/${pluginInfo.version}`
        }
      }
    )
    console.log('版本更新检测响应:', body)
    if (!body || body.code !== 200) {
      console.error('版本更新检测失败:', body.message || '未知错误')
    } else {
      if (body.data != null) {
        NoticeCenter('update', {
          title: `${pluginInfo.name} 有新的版本 ${body.data.version}`,
          content: body.data.updateMsg,
          url: `${body.data.updateUrl}`, // 可选 当通知为update 版本跟新可传
          version: body.data.version, // 当通知为update 版本更新可传
          pluginInfo: {
            name: pluginInfo.name,
            type: 'cr' // 固定唯一标识
          } // 当通知为update 版本跟新可传
        })
      } else {
        console.log(`${pluginInfo.name} 没有新的版本`)
      }
    }
  } catch (error) {
    console.error('checkUpdate error:', error)
  }
}
checkUpdate().then(() => {
  console.log('版本更新检测完成')
})

// 导出插件
module.exports = {
  pluginInfo,
  sources,
  musicUrl
}
```

---

## LX 兼容插件开发 引用于落雪官网改编

CeruMusic 可以兼容 LX Music 的插件格式，支持事件驱动的开发模式。

### 基本结构

```javascript
/**
 * @name 测试音乐源
 * @description 我只是一个测试音乐源哦
 * @version 1.0.0
 * @author xxx
 * @homepage http://xxx
 */

const { EVENT_NAMES, request, on, send } = globalThis.lx

// 音质配置
const qualitys = {
  kw: {
    '128k': '128',
    '320k': '320',
    flac: 'flac',
    flac24bit: 'flac24bit'
  },
  local: {}
}

// HTTP 请求封装
const httpRequest = (url, options) =>
  new Promise((resolve, reject) => {
    request(url, options, (err, resp) => {
      if (err) return reject(err)
      resolve(resp.body)
    })
  })

// API 实现
const apis = {
  kw: {
    musicUrl({ songmid }, quality) {
      return httpRequest('http://xxx').then((data) => {
        return data.url
      })
    }
  },
  local: {
    musicUrl(info) {
      return httpRequest('http://xxx').then((data) => {
        return data.url
      })
    },
    pic(info) {
      return httpRequest('http://xxx').then((data) => {
        return data.url
      })
    },
    lyric(info) {
      return httpRequest('http://xxx').then((data) => {
        return {
          lyric: '...', // 歌曲歌词
          tlyric: '...', // 翻译歌词，没有可为 null
          rlyric: '...', // 罗马音歌词，没有可为 null
          lxlyric: '...' // lx 逐字歌词，没有可为 null
        }
      })
    }
  }
}

// 注册 API 请求事件
on(EVENT_NAMES.request, ({ source, action, info }) => {
  switch (action) {
    case 'musicUrl':
      return apis[source].musicUrl(info.musicInfo, qualitys[source][info.type])
    case 'lyric':
      return apis[source].lyric(info.musicInfo)
    case 'pic':
      return apis[source].pic(info.musicInfo)
  }
})

// 发送初始化完成事件
send(EVENT_NAMES.inited, {
  openDevTools: false, // 是否打开开发者工具
  sources: {
    kw: {
      name: '酷我音乐',
      type: 'music',
      actions: ['musicUrl'],
      qualitys: ['128k', '320k', 'flac', 'flac24bit']
    },
    local: {
      name: '本地音乐',
      type: 'music',
      actions: ['musicUrl', 'lyric', 'pic'],
      qualitys: []
    }
  }
})
```

### LX API 参考

#### globalThis.lx.EVENT_NAMES

事件名称常量：

- `inited`: 初始化完成事件
- `request`: API 请求事件
- `updateAlert`: 更新提示事件

#### globalThis.lx.on(eventName, handler)

注册事件监听器：

```javascript
lx.on(lx.EVENT_NAMES.request, ({ source, action, info }) => {
  // 必须返回 Promise
  return Promise.resolve(result)
})
```

#### globalThis.lx.send(eventName, data)

发送事件：

```javascript
// 发送初始化事件
lx.send(lx.EVENT_NAMES.inited, {
  openDevTools: false,
  sources: {...}
});

// 发送更新提示
lx.send(lx.EVENT_NAMES.updateAlert, {
  log: '更新日志\n修复了一些问题',
  updateUrl: 'https://example.com/update'
});
```

#### globalThis.lx.request(url, options, callback)

HTTP 请求方法：

```javascript
lx.request(
  'https://api.example.com',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    timeout: 10000
  },
  (err, resp) => {
    if (err) {
      console.error('请求失败:', err)
      return
    }
    console.log('响应:', resp.body)
  }
)
```

#### globalThis.lx.utils

工具方法：

```javascript
// Buffer 操作
lx.utils.buffer.from(data, encoding)
lx.utils.buffer.bufToString(buffer, encoding)

// 加密工具
lx.utils.crypto.md5(str)
lx.utils.crypto.aesEncrypt(buffer, mode, key, iv)
lx.utils.crypto.randomBytes(size)
lx.utils.crypto.rsaEncrypt(buffer, key)
```

---

## 音源配置

### 支持的音源 ID

- `kw`: 酷我音乐
- `kg`: 酷狗音乐
- `tx`: QQ音乐
- `wy`: 网易云音乐
- `mg`: 咪咕音乐
- `local`: 本地音乐

### 支持的音质

- `128k`: 128kbps
- `320k`: 320kbps
- `flac`: FLAC 无损
- `flac24bit`: 24bit FLAC
- `hires`: Hi-Res 高解析度
- `atmos`: 杜比全景声
- `master`: 母带音质

---

## 错误处理

### 最佳实践

```javascript
async function musicUrl(source, musicInfo, quality) {
  try {
    // 参数验证
    if (!musicInfo || !musicInfo.id) {
      throw new Error('音乐信息不完整')
    }

    // API 调用
    const result = await cerumusic.request(url, options)

    // 结果验证
    if (!result || result.statusCode !== 200) {
      throw new Error(`API 请求失败: ${result?.statusCode || 'Unknown'}`)
    }

    if (!result.body || !result.body.url) {
      throw new Error('返回数据格式错误')
    }

    return result.body.url
  } catch (error) {
    // 记录错误日志
    console.error(`[${source}] 获取音乐链接失败:`, error.message)

    // 重新抛出错误供上层处理
    throw new Error(`获取 ${source} 音乐链接失败: ${error.message}`)
  }
}
```

### 常见错误类型

1. **网络错误**: 请求超时、连接失败
2. **API 错误**: 接口返回错误状态码
3. **数据错误**: 返回数据格式不正确
4. **参数错误**: 传入参数不完整或格式错误

---

## 调试技巧

### 1. 使用 console.log

```javascript
console.log('[插件名] 调试信息:', data)
console.warn('[插件名] 警告信息:', warning)
console.error('[插件名] 错误信息:', error)
```

### 2. LX 插件开发者工具

```javascript
send(EVENT_NAMES.inited, {
  openDevTools: true, // 开启开发者工具
  sources: {...}
});
```

### 3. 错误捕获

```javascript
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason)
})
```

---

## 性能优化

### 1. 请求缓存

```javascript
const cache = new Map()

async function getCachedData(key, fetcher, ttl = 300000) {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data
  }

  const data = await fetcher()
  cache.set(key, { data, timestamp: Date.now() })
  return data
}
```

### 2. 请求超时控制

```javascript
const result = await cerumusic.request(url, {
  timeout: 10000 // 10秒超时
})
```

### 3. 并发控制

```javascript
// 限制并发请求数量
const semaphore = new Semaphore(3) // 最多3个并发请求

async function limitedRequest(url, options) {
  await semaphore.acquire()
  try {
    return await cerumusic.request(url, options)
  } finally {
    semaphore.release()
  }
}
```

---

## 安全注意事项

### 1. 输入验证

```javascript
function validateMusicInfo(musicInfo) {
  if (!musicInfo || typeof musicInfo !== 'object') {
    throw new Error('音乐信息格式错误')
  }

  if (!musicInfo.id || typeof musicInfo.id !== 'string') {
    throw new Error('音乐 ID 无效')
  }

  return true
}
```

### 2. URL 验证

```javascript
function isValidUrl(url) {
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch {
    return false
  }
}
```

### 3. 敏感信息保护

```javascript
// 不要在日志中输出敏感信息
console.log('请求参数:', {
  ...params,
  token: '***', // 隐藏敏感信息
  password: '***'
})
```

---

## 插件发布

### 1. 代码检查清单

- [ ] 插件信息注释完整
- [ ] 错误处理完善
- [ ] 性能优化合理
- [ ] 安全验证到位
- [ ] 测试覆盖充分

### 2. 测试建议

```javascript
// 单元测试示例
async function testMusicUrl() {
  const testMusicInfo = {
    id: 'test123',
    name: '测试歌曲',
    artist: '测试歌手'
  }

  try {
    const url = await musicUrl('kw', testMusicInfo, '320k')
    console.log('测试通过:', url)
  } catch (error) {
    console.error('测试失败:', error)
  }
}
```

### 3. 版本管理

使用语义化版本号：

- `1.0.0`: 主版本.次版本.修订版本
- 主版本：不兼容的 API 修改
- 次版本：向下兼容的功能性新增
- 修订版本：向下兼容的问题修正

---

## 常见问题

### Q: 插件加载失败怎么办？

A: 检查以下几点：

1. 文件编码是否为 UTF-8
2. 插件信息注释格式是否正确
3. JavaScript 语法是否有错误
4. 是否正确导出了必需的方法

### Q: 如何处理跨域请求？

A: CeruMusic 的请求方法不受浏览器跨域限制，可以直接请求任何域名的 API。

### Q: 插件如何更新？

A: 使用 `cerumusic.NoticeCenter` 事件通知用户更新：

```javascript
cerumusic.NoticeCenter('update', {
  title: '新版本更新',
  content: 'xxxx',
  version: 'v1.0.3',
  url: 'https://shiqianjiang.cn',
  pluginInfo: {
    type: 'cr'
  }
})
```

### Q: 如何调试插件？

A:

1. 使用 `console.log` 输出调试信息 可在设置—>插件管理—>日志 查看调试
2. LX 插件可以设置 `openDevTools: true` 打开开发者工具
3. 查看 CeruMusic 的插件日志

---

## 技术支持

如有问题或建议，请通过以下方式联系：

- GitHub Issues: [CeruMusic Issues](https://github.com/timeshiftsauce/CeruMusic/issues)
- Blog (最好登录，否则需要审核): [CeruMusic Blog](https://shiqianjiang.cn/blog/4966904626407280640)
