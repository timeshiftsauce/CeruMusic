# 插件通知系统使用说明

## 概述

CeruMusic 插件通知系统允许插件向用户显示各种类型的通知对话框，包括信息、警告、错误、成功和更新通知。

## 功能特性

### 🎯 支持的通知类型

1. **信息通知 (info)** - 显示一般信息
2. **警告通知 (warning)** - 显示警告信息
3. **错误通知 (error)** - 显示错误信息
4. **成功通知 (success)** - 显示成功信息
5. **更新通知 (update)** - 显示插件更新信息，支持一键更新

### 🎨 界面特性

- 使用 TDesign 组件库，界面美观统一
- 支持深色主题适配
- 响应式设计，移动端友好
- 不同通知类型有对应的图标和颜色

### ⚡ 技术特性

- 基于 Electron IPC 通信
- TypeScript 类型安全
- 异步操作支持
- 错误处理完善

## 使用方法

### 在插件中调用通知

```javascript
// 基本用法
this.cerumusic.NoticeCenter(type, data)

// 信息通知
this.cerumusic.NoticeCenter('info', {
  title: '插件信息',
  message: '这是一条信息通知',
  content: '详细的信息内容'
})

// 警告通知
this.cerumusic.NoticeCenter('warning', {
  title: '注意',
  message: '这是一条警告信息',
  content: '请检查相关设置'
})

// 错误通知
this.cerumusic.NoticeCenter('error', {
  title: '错误',
  message: '操作失败',
  error: '具体的错误信息'
})

// 成功通知
this.cerumusic.NoticeCenter('success', {
  title: '成功',
  message: '操作已成功完成'
})

// 更新通知（特殊）
this.cerumusic.NoticeCenter('update', {
  title: '插件更新',
  message: '发现新版本，是否立即更新？',
  url: 'https://example.com/plugin-update.js',
  version: '2.0.0',
  pluginInfo: {
    name: '插件名称',
    type: 'cr', // 'cr' 或 'lx'
    forcedUpdate: false
  }
})
```

### 参数说明

#### 通用参数 (data 对象)

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 否 | 通知标题，不提供时使用默认标题 |
| message | string | 否 | 通知消息内容 |
| content | string | 否 | 详细内容（与 message 二选一） |

#### 更新通知特有参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 插件更新下载链接 |
| version | string | 否 | 新版本号 |
| pluginInfo.name | string | 否 | 插件名称 |
| pluginInfo.type | 'cr' \| 'lx' | 否 | 插件类型 |
| pluginInfo.forcedUpdate | boolean | 否 | 是否强制更新 |

#### 错误通知特有参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| error | string | 否 | 具体错误信息 |

## 实现原理

### 架构图

```
插件代码
    ↓ (调用 NoticeCenter)
CeruMusicPluginHost
    ↓ (sendPluginNotice)
pluginNotice.ts (主进程)
    ↓ (IPC 通信)
PluginNoticeDialog.vue (渲染进程)
    ↓ (显示对话框)
用户界面
```

### 文件结构

```
src/
├── main/
│   ├── events/
│   │   └── pluginNotice.ts          # 主进程通知处理
│   └── services/plugin/manager/
│       └── CeruMusicPluginHost.ts   # 插件主机
├── renderer/src/
│   ├── components/
│   │   └── PluginNoticeDialog.vue   # 通知对话框组件
│   └── App.vue                      # 主应用（注册组件）
└── preload/
    └── index.ts                     # IPC API 定义
```

## 测试

### 使用测试插件

1. 将 `docs/plugin-notice-test.js` 作为插件加载
2. 调用插件的 `musicUrl` 方法
3. 观察不同类型的通知是否正确显示

### 测试场景

- [x] 信息通知显示
- [x] 警告通知显示
- [x] 错误通知显示
- [x] 成功通知显示
- [x] 更新通知显示（带更新按钮）
- [x] 更新按钮功能
- [x] 对话框关闭功能
- [x] 响应式布局
- [x] 深色主题适配

## 注意事项

1. **URL 验证**: 更新通知的 URL 必须是有效的 HTTP/HTTPS 链接
2. **错误处理**: 所有通知操作都有完善的错误处理机制
3. **性能考虑**: 避免频繁发送通知，可能影响用户体验
4. **类型安全**: 使用 TypeScript 确保参数类型正确

## 扩展功能

### 未来可能的增强

- [ ] 通知历史记录
- [ ] 通知优先级系统
- [ ] 批量通知管理
- [ ] 自定义通知样式
- [ ] 通知声音提醒
- [ ] 通知位置自定义

## 故障排除

### 常见问题

1. **通知不显示**
   - 检查主窗口是否存在
   - 确认 IPC 通信是否正常
   - 查看控制台错误信息

2. **更新按钮无响应**
   - 确认更新 URL 是否有效
   - 检查网络连接
   - 查看主进程日志

3. **样式显示异常**
   - 确认 TDesign 组件库已正确加载
   - 检查 CSS 样式是否冲突
   - 验证主题配置

### 调试方法

```javascript
// 在插件中添加调试日志
console.log('[Plugin] 发送通知:', type, data)

// 在渲染进程中监听通知
window.api.on('plugin-notice', (_, notice) => {
  console.log('[Renderer] 收到通知:', notice)
})
```

## 更新日志

### v1.0.0 (2025-09-20)
- ✨ 初始版本发布
- ✨ 支持 5 种通知类型
- ✨ 完整的 TypeScript 类型定义
- ✨ 响应式设计和深色主题支持
- ✨ 完善的错误处理机制