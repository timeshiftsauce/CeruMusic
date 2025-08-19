# CeruMusic 插件开发文档

## 概述

本文档介绍如何为 CeruMusic 开发音乐源插件。CeruMusic 插件是运行在沙箱环境中的 JavaScript 模块，用于从各种音乐平台获取音乐资源。

## 插件结构

### 基本结构

每个 CeruMusic 插件必须导出以下三个核心组件：

```javascript
module.exports = {
  pluginInfo,    // 插件信息
  sources,       // 支持的音源
  musicUrl       // 获取音乐链接的函数
};
```

# 完整示例

```javascript
/**
 * 示例音乐插件
 * @author 开发者名称
 * @version 1.0.0
 */

// 1. 插件信息
const pluginInfo = {
  name: '示例音源插件',
  version: '1.0.0',
  author: '开发者名称',
  description: '这是一个示例音乐源插件',
};

// 2. 支持的音源配置
const sources = {
  demo: {
    name: '示例音源',
    type: 'music',
    qualitys: ['128k', '320k', 'flac'],
  },
  demo2: {
    name: '示例音源2',
    type: 'music', 
    qualitys: ['128k', '320k'],
  }
};

// 3. 获取音乐URL的核心函数
async function musicUrl(source, musicInfo, quality) {
  // 从 cerumusic 对象获取 API
  const { request, env, version } = cerumusic;
  
  // 构建请求参数
  const songId = musicInfo.hash ?? musicInfo.songmid;
  const apiUrl = `https://api.example.com/music/${source}/${songId}/${quality}`;
  
  console.log(`[${pluginInfo.name}] 请求音乐链接: ${apiUrl}`);
  
  // 发起网络请求
  const { body, statusCode } = await request(apiUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `cerumusic-${env}/${version}`,
    },
  });
  
  // 处理响应
  if (statusCode !== 200 || body.code !== 200) {
    const errorMessage = body.msg || `接口错误 (HTTP: ${statusCode})`;
    console.error(`[${pluginInfo.name}] Error: ${errorMessage}`);
    throw new Error(errorMessage);
  }
  
  console.log(`[${pluginInfo.name}] 获取成功: ${body.url}`);
  return body.url;
}

// 4. 可选：获取封面图片
async function getPic(source, musicInfo) {
  const { request } = cerumusic;
  const songId = musicInfo.hash ?? musicInfo.songmid;
  
  const { body } = await request(`https://api.example.com/pic/${source}/${songId}`);
  return body.picUrl;
}

// 5. 可选：获取歌词
async function getLyric(source, musicInfo) {
  const { request } = cerumusic;
  const songId = musicInfo.hash ?? musicInfo.songmid;
  
  const { body } = await request(`https://api.example.com/lyric/${source}/${songId}`);
  return body.lyric;
}

// 导出插件
module.exports = {
  pluginInfo,
  sources,
  musicUrl,
  getPic,    // 可选
  getLyric,  // 可选
};
```

## 详细说明

### 1. pluginInfo 对象

插件的基本信息，必须包含以下字段：

```javascript
const pluginInfo = {
  name: '插件名称',           // 必需：插件显示名称
  version: '1.0.0',          // 必需：版本号
  author: '作者名',          // 必需：作者信息
  description: '插件描述',    // 必需：功能描述
};
```

### 2. sources 对象

定义插件支持的音源，键为音源标识，值为音源配置：

```javascript
const sources = {
  // 音源标识（用于API调用）
  'source_id': {
    name: '音源显示名称',      // 必需：用户看到的名称
    type: 'music',           // 必需：固定为 'music'
    qualitys: [              // 必需：支持的音质列表
      '128k',                // 标准音质
      '320k',                // 高音质
      'flac',                // 无损音质
      'flac24bit',           // 24位无损
      'hires'                // 高解析度
    ],
  }
};
```

### 3. musicUrl 函数

获取音乐播放链接的核心函数：

```javascript
async function musicUrl(source, musicInfo, quality) {
  // source: 音源标识（sources 对象的键）
  // musicInfo: 歌曲信息对象
  // quality: 请求的音质
  
  // 返回: Promise<string> - 音乐播放链接
}
```

#### musicInfo 对象结构

```javascript
const musicInfo = {
  songmid: '歌曲ID',         // 歌曲标识符
  hash: '歌曲哈希',          // 备用标识符
  title: '歌曲标题',         // 歌曲名称
  artist: '艺术家',          // 演唱者
  album: '专辑名',           // 专辑信息
  // ... 其他可能的字段
};
```

## 可用 API

### cerumusic 对象

插件运行时可以访问 `cerumusic` 全局对象：

```javascript
const { request, env, version, utils } = cerumusic;
```

#### request 函数

用于发起 HTTP 请求：

```javascript
// Promise 模式
const response = await request(url, options);

// Callback 模式  
request(url, options, (error, response) => {
  if (error) {
    console.error('请求失败:', error);
    return;
  }
  console.log('响应:', response);
});
```

**参数说明:**
- `url` (string): 请求地址
- `options` (Object): 请求选项
  - `method`: HTTP 方法 ('GET', 'POST', 等)
  - `headers`: 请求头对象
  - `body`: 请求体（POST 请求时）

**响应格式:**
```javascript
{
  body: {},              // 解析后的响应体
  statusCode: 200,       // HTTP 状态码
  headers: {}            // 响应头
}
```

#### utils 对象

提供实用工具函数：

```javascript
const { utils } = cerumusic;

// Buffer 操作
const buffer = utils.buffer.from('hello', 'utf8');
const string = utils.buffer.bufToString(buffer, 'utf8');
```

## 错误处理

### 最佳实践

1. **总是检查 API 响应状态**
   ```javascript
   if (statusCode !== 200 || body.code !== 200) {
     throw new Error(`请求失败: ${body.msg || '未知错误'}`);
   }
   ```

2. **提供有意义的错误信息**
   ```javascript
   console.error(`[${pluginInfo.name}] Error: ${errorMessage}`);
   throw new Error(errorMessage);
   ```

3. **处理网络异常**
   ```javascript
   try {
     const response = await request(url, options);
     // 处理响应
   } catch (error) {
     console.error(`[${pluginInfo.name}] 网络请求失败:`, error.message);
     throw new Error(`网络错误: ${error.message}`);
   }
   ```

### 常见错误类型

- **网络错误**: 无法连接到 API 服务器
- **认证错误**: API 密钥无效或过期
- **参数错误**: 请求参数格式不正确
- **资源不存在**: 请求的歌曲不存在
- **限流错误**: 请求过于频繁

## 事件驱动插件

对于使用 `lx.on(EVENT_NAMES.request)` 模式的插件，可以使用转换器：

```javascript
// 使用转换器转换事件驱动插件
node converter-event-driven.js input-plugin.js output-plugin.js
```

转换后的插件将兼容 CeruMusicPluginHost。

## 调试技巧

### 1. 使用 console.log

```javascript
console.log(`[${pluginInfo.name}] 调试信息:`, data);
console.error(`[${pluginInfo.name}] 错误:`, error);
```

### 2. 检查请求和响应

```javascript
console.log('请求URL:', url);
console.log('请求选项:', options);
console.log('响应状态:', statusCode);
console.log('响应内容:', body);
```

### 3. 测试插件

创建测试文件：

```javascript
const CeruMusicPluginHost = require('./CeruMusicPluginHost');

async function testPlugin() {
  const host = new CeruMusicPluginHost();
  await host.loadPlugin('./my-plugin.js');
  
  const musicInfo = {
    songmid: 'test123',
    title: '测试歌曲'
  };
  
  try {
    const url = await host.getMusicUrl('demo', musicInfo, '320k');
    console.log('成功获取URL:', url);
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

testPlugin();
```

## 发布和分发

### 文件结构

```
my-plugin/
├── plugin.js          # 主插件文件
├── package.json       # 包信息（可选）
├── README.md          # 说明文档
└── test.js           # 测试文件（可选）
```

### 版本管理

遵循语义化版本规范：
- `1.0.0` - 主版本.次版本.修订版本
- 主版本：不兼容的 API 修改
- 次版本：向下兼容的功能性新增
- 修订版本：向下兼容的问题修正

## 示例插件

查看项目中的示例：
- `example-plugin.js` - 基础插件示例
- `plugin.js` - 事件驱动插件示例
- `fm.js` - 复杂插件示例

## 常见问题

**Q: 如何处理需要登录的 API？**

A: 在请求头中添加认证信息，或使用 Cookie。

**Q: 如何处理加密的 API 响应？**

A: 在插件中实现解密逻辑，使用 `utils` 对象提供的工具函数。

**Q: 插件可以访问文件系统吗？**

A: 不可以，插件运行在受限的沙箱环境中，无法直接访问文件系统。

**Q: 如何优化插件性能？**

A: 减少不必要的网络请求，使用适当的缓存策略，避免阻塞操作。

## 贡献指南

1. Fork 项目仓库
2. 创建功能分支
3. 编写插件代码和测试
4. 提交 Pull Request
5. 等待代码审查

欢迎贡献新的音源插件！