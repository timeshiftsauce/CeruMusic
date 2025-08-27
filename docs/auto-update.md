# 自动更新功能说明

## 功能概述

本项目集成了完整的自动更新功能，使用 Electron 的 `autoUpdater` 模块和 TDesign 的通知组件，为用户提供友好的更新体验。

## 架构设计

### 主进程 (Main Process)

1. **autoUpdate.ts** - 自动更新核心逻辑
   - 配置更新服务器地址
   - 监听 autoUpdater 事件
   - 通过 IPC 向渲染进程发送更新消息

2. **events/autoUpdate.ts** - IPC 事件处理
   - 注册检查更新和安装更新的 IPC 处理器

### 渲染进程 (Renderer Process)

1. **services/autoUpdateService.ts** - 更新服务
   - 处理来自主进程的更新消息
   - 使用 TDesign Notification 显示更新通知
   - 管理更新状态和用户交互

2. **composables/useAutoUpdate.ts** - Vue 组合式函数
   - 封装自动更新功能，便于在组件中使用
   - 管理监听器的生命周期

3. **components/Settings/UpdateSettings.vue** - 更新设置组件
   - 提供手动检查更新的界面
   - 显示当前版本信息

## 更新流程

1. **启动检查**: 应用启动后延迟3秒自动检查更新
2. **检查更新**: 向更新服务器发送请求检查新版本
3. **下载更新**: 如有新版本，自动下载更新包
4. **安装提示**: 下载完成后提示用户重启安装
5. **自动安装**: 用户确认后退出应用并安装更新

## 通知类型

- **检查更新**: 显示正在检查更新的信息通知
- **发现新版本**: 显示发现新版本并开始下载的成功通知
- **无需更新**: 显示当前已是最新版本的信息通知
- **下载进度**: 实时显示下载进度和速度
- **下载完成**: 显示下载完成并提供重启按钮
- **更新错误**: 显示更新过程中的错误信息

## 配置说明

### 更新服务器配置

在 `src/main/autoUpdate.ts` 中配置更新服务器地址：

```typescript
const server = 'https://update.ceru.shiqianjiang.cn/';
```

### 版本检查

更新服务器需要提供以下格式的 API：
- URL: `${server}/update/${platform}/${currentVersion}`
- 返回: 更新信息 JSON

## 使用方法

### 在组件中使用

```vue
<script setup lang="ts">
import { useAutoUpdate } from '@/composables/useAutoUpdate'

const { checkForUpdates } = useAutoUpdate()

// 手动检查更新
const handleCheckUpdate = async () => {
  await checkForUpdates()
}
</script>
```

### 监听更新消息

```typescript
import { autoUpdateService } from '@/services/autoUpdateService'

// 开始监听
autoUpdateService.startListening()

// 停止监听
autoUpdateService.stopListening()
```

## 注意事项

1. **权限要求**: 自动更新需要应用具有写入权限
2. **网络连接**: 需要稳定的网络连接来下载更新
3. **用户体验**: 更新过程中避免强制重启，给用户选择权
4. **错误处理**: 妥善处理网络错误和下载失败的情况

## 开发调试

在开发环境中，可以通过以下方式测试自动更新：

1. 修改 `package.json` 中的版本号
2. 在更新设置页面手动触发检查更新
3. 观察控制台日志和通知显示

## 构建配置

确保在 `electron-builder` 配置中启用自动更新：

```json
{
  "publish": {
    "provider": "generic",
    "url": "https://update.ceru.shiqianjiang.cn/"
  }
}