import { autoUpdateService, downloadState } from '../services/autoUpdateService'

export function useAutoUpdate() {
  // 检查更新
  const checkForUpdates = async () => {
    await autoUpdateService.checkForUpdates()
  }

  // 下载更新
  const downloadUpdate = async () => {
    await autoUpdateService.downloadUpdate()
  }

  // 安装更新
  const quitAndInstall = async () => {
    await autoUpdateService.quitAndInstall()
  }

  return {
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    downloadState // 导出下载状态供组件使用
  }
}
