---
layout: doc
---

# CeruMusicPluginHost 使用文档

## 概述

CeruMusicPluginHost 是一个用于加载和执行 CeruMusic 插件的 JavaScript 引擎。它提供了一个安全的沙箱环境来运行插件代码，并提供标准化的 API 接口。

## 特性

- 🔒 **安全沙箱环境**：插件在隔离的 VM 环境中运行
- 🌐 **网络请求支持**：内置 HTTP 请求功能
- #### 🔧 **标准化 API**：提供统一的插件接口
- 📦 **多种加载方式**：支持代码字符串和文件路径加载
- 🛡️ **错误处理**：完善的错误捕获和处理机制

## 安装

```bash
npm install node-fetch
```

## 快速开始

### 基本使用

```javascript
const CeruMusicPluginHost = require('./CeruMusicPluginHost')

// 方式1: 从代码字符串创建
const pluginCode = `
const pluginInfo = {
  name: "示例插件",
  version: "1.0.0",
  author: "作者名",
  description: "插件描述"
};

const sources = {
  demo: {
    name: "示例音源",
    type: "music",
    qualitys: ["128k", "320k"]
  }
};

async function musicUrl(source, musicInfo, quality) {
  // 插件逻辑
  return "https://example.com/music.mp3";
}

module.exports = { pluginInfo, sources, musicUrl };
`

const host = new CeruMusicPluginHost(pluginCode)

// 方式2: 从文件加载
const host2 = new CeruMusicPluginHost()
await host2.loadPlugin('./my-plugin.js')
```

### 获取插件信息

```javascript
// 获取插件基本信息
const info = host.getPluginInfo()
console.log(info)
// 输出: { name: "示例插件", version: "1.0.0", ... }

// 获取支持的音源
const sources = host.getSupportedSources()
console.log(sources)
// 输出: { demo: { name: "示例音源", type: "music", ... } }
```

### 调用插件方法

```javascript
// 获取音乐URL
try {
  const musicInfo = {
    songmid: '123456',
    hash: 'abcdef',
    title: '歌曲名'
  }

  const url = await host.getMusicUrl('demo', musicInfo, '320k')
  console.log('音乐URL:', url)
} catch (error) {
  console.error('获取失败:', error.message)
}

// 获取歌曲封面（如果插件支持）
try {
  const picUrl = await host.getPic('demo', musicInfo)
  console.log('封面URL:', picUrl)
} catch (error) {
  console.error('获取封面失败:', error.message)
}

// 获取歌词（如果插件支持）
try {
  const lyric = await host.getLyric('demo', musicInfo)
  console.log('歌词:', lyric)
} catch (error) {
  console.error('获取歌词失败:', error.message)
}
```

## API 参考

### 构造函数

`new CeruMusicPluginHost(pluginCode)`

**参数:**

- `pluginCode` (string, 可选): 插件的 JavaScript 代码字符串

### 方法

#### loadPlugin(pluginPath)

从文件加载插件。

**参数:**

`pluginPath` (string): 插件文件路径

**返回:** `Promise<Object>` - 插件导出的对象

#### getPluginInfo()

获取插件基本信息。

**返回:** Object - 包含 name, version, author, description 等字段

#### getSupportedSources()

获取插件支持的音源列表。

**返回:** Object - 音源配置对象

#### getMusicUrl(source, musicInfo, quality)

获取音乐播放链接。

**参数:**

- `source` (string): 音源标识
- `musicInfo` (Object): 歌曲信息对象
- `quality` (string): 音质标识

**返回:** `Promise<string>` - 音乐播放链接

#### getPic(source, musicInfo)

获取歌曲封面链接。

**参数:**

- `source` (string): 音源标识
- `musicInfo` (Object): 歌曲信息对象

**返回:** `Promise<string>` - 封面链接

#### getLyric(source, musicInfo)

获取歌曲歌词。

**参数:**

- `source` (string): 音源标识
- `musicInfo` (Object): 歌曲信息对象

**返回:** `Promise<string>` - 歌词内容

## 插件环境

### 可用的全局对象

插件运行时可以访问以下全局对象：

```javascript
// CeruMusic API
cerumusic.env // 运行环境标识
cerumusic.version // 版本号
cerumusic.request // HTTP 请求函数
cerumusic.utils // 工具函数集合

// 标准 JavaScript 对象
console // 控制台输出
setTimeout // 定时器
clearTimeout
setInterval
clearInterval
Buffer // Node.js Buffer
JSON // JSON 处理
```

### HTTP 请求

插件可以使用 `cerumusic.request` 进行网络请求：

```javascript
// 支持 callback 模式
cerumusic.request(url, options, (error, response) => {
  if (error) {
    console.error('请求失败:', error)
    return
  }

  console.log('响应状态:', response.statusCode)
  console.log('响应内容:', response.body)
})

// 也支持 Promise 模式
const response = await cerumusic.request(url, options)
```

## 错误处理

### 常见错误类型

1. **插件加载错误**

   ```javascript
   try {
     const host = new CeruMusicPluginHost(invalidCode)
   } catch (error) {
     console.error('插件加载失败:', error.message)
   }
   ```

2. **方法调用错误**

   ```javascript
   try {
     const url = await host.getMusicUrl('invalid_source', {}, '320k')
   } catch (error) {
     console.error('方法调用失败:', error.message)
   }
   ```

3. **网络请求错误**
   - 插件内部的网络请求失败会通过 callback 的 error 参数传递
   - 插件应该适当处理这些错误并向外抛出有意义的错误信息

### 最佳实践

1. **总是使用 try-catch 包装插件调用**
2. **检查插件是否实现了所需的方法**
3. **为网络请求设置合理的超时时间**
4. **提供有意义的错误信息**

## 示例项目

查看项目中的示例文件：

- `example-plugin.js` - 标准插件示例
- `test-converted-plugin.js` - 插件测试示例

## 故障排除

### 常见问题

**Q: 插件加载失败，提示 "Invalid plugin structure"**

A: 确保插件导出了必需的字段：`pluginInfo`, `sources`, `musicUrl`

**Q: 网络请求总是失败**

A: 检查网络连接，确认目标 API 可访问，检查请求参数格式

**Q: 插件方法调用超时**

A: 检查插件内部是否有死循环或长时间阻塞的操作

## 版本历史

- v1.0.0: 初始版本，支持基本的插件加载和执行功能
