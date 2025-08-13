# 音乐API接口文档

## 概述

这是一个基于 Meting 库的音乐API接口，支持多个音乐平台的数据获取，包括歌曲信息、专辑、歌词、播放链接等。

## 基础信息

- **请求方式**: GET
- **返回格式**: JSON
- **字符编码**: UTF-8
- **跨域支持**: 是

## 请求参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| server | string | 否 | netease | 音乐平台 |
| type | string | 否 | search | 请求类型 |
| id | string | 否 | hello | 查询ID或关键词 |

### 支持的音乐平台 (server)

| 平台代码 | 平台名称 |
|----------|----------|
| netease | 网易云音乐 |
| tencent | QQ音乐 |
| baidu | 百度音乐 |
| xiami | 虾米音乐 |
| kugou | 酷狗音乐 |
| kuwo | 酷我音乐 |

### 支持的请求类型 (type)

| 类型 | 说明 | id参数说明 |
|------|------|------------|
| search | 搜索歌曲 | 搜索关键词 |
| song | 获取歌曲详情 | 歌曲ID |
| album | 获取专辑信息 | 专辑ID |
| artist | 获取歌手信息 | 歌手ID |
| playlist | 获取歌单信息 | 歌单ID |
| lrc | 获取歌词 | 歌曲ID |
| url | 获取播放链接 | 歌曲ID |
| pic | 获取封面图片 | 歌曲/专辑/歌手ID |

## 响应格式

### 成功响应

```json
{
  "success": true,
  "message": {
    // 具体数据内容，根据请求类型不同而不同
  }
}
```

### 错误响应

```json
{
  "success": false,
  "message": "错误信息"
}
```

## 请求示例

### 1. 搜索歌曲

```
GET /?server=netease&type=search&id=周杰伦
```

**响应示例**:
```json
{
  "success": true,
  "message": [
    {
      "id": "186016",
      "name": "青花瓷",
      "artist": ["周杰伦"],
      "album": "我很忙",
      "pic_id": "109951163240682406",
      "url_id": "186016",
      "lyric_id": "186016"
    }
  ]
}
```

### 2. 获取歌曲详情

```
GET /?server=netease&type=song&id=186016
```

### 3. 获取歌词

```
GET /?server=netease&type=lrc&id=186016
```

**响应示例**:
```json
{
  "success": true,
  "message": {
    "lyric": "[00:00.00] 作词 : 方文山\n[00:01.00] 作曲 : 周杰伦\n[00:22.78]素胚勾勒出青花笔锋浓转淡\n..."
  }
}
```

### 4. 获取播放链接

```
GET /?server=netease&type=url&id=186016
```

**响应示例**:
```json
{
  "success": true,
  "message": [
    {
      "id": "186016",
      "url": "http://music.163.com/song/media/outer/url?id=186016.mp3",
      "size": 4729252,
      "br": 128
    }
  ]
}
```

### 5. 获取专辑信息

```
GET /?server=netease&type=album&id=18905
```

### 6. 获取歌手信息

```
GET /?server=netease&type=artist&id=6452
```

### 7. 获取歌单信息

```
GET /?server=netease&type=playlist&id=19723756
```

### 8. 获取封面图片

```
GET /?server=netease&type=pic&id=186016
```

## 错误码说明

| 错误信息 | 说明 |
|----------|------|
| require id. | 缺少必需的id参数 |
| unsupported server. | 不支持的音乐平台 |
| unsupported type. | 不支持的请求类型 |

## 注意事项

1. **代理支持**: 如果设置了环境变量 `METING_PROXY`，API会使用代理访问音乐平台
2. **Cookie支持**: API会自动传递请求中的Cookie到音乐平台
3. **跨域访问**: API已配置CORS，支持跨域请求
4. **请求频率**: 建议控制请求频率，避免被音乐平台限制
5. **数据时效性**: 音乐平台的数据可能会发生变化，建议适当缓存但不要过度依赖

## 使用建议

1. **错误处理**: 请务必检查响应中的 `success` 字段
2. **数据验证**: 返回的数据结构可能因平台而异，请做好数据验证
3. **备用方案**: 建议支持多个音乐平台作为备用数据源
4. **缓存策略**: 对于不经常变化的数据（如歌词、专辑信息）建议进行缓存

## 技术实现

本API基于以下技术栈：
- **PHP**: 后端语言
- **Meting**: 音乐数据获取库
- **Composer**: 依赖管理

## 更新日志

- **v1.0.0**: 初始版本，支持基础的音乐数据获取功能