import { NotifyPlugin, DialogPlugin } from 'tdesign-vue-next'

import { reactive } from 'vue'

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
}

export interface UpdateInfo {
  url: string
  name: string
  notes: string
  pub_date: string
}

// 响应式的下载状态
export const downloadState = reactive({
  isDownloading: false,
  progress: {
    percent: 0,
    transferred: 0,
    total: 0
  } as DownloadProgress,
  updateInfo: null as UpdateInfo | null
})

export class AutoUpdateService {
  private static instance: AutoUpdateService
  private isListening = false

  constructor() {
    // 构造函数中自动开始监听
    this.startListening()
  }

  static getInstance(): AutoUpdateService {
    if (!AutoUpdateService.instance) {
      AutoUpdateService.instance = new AutoUpdateService()
    }
    return AutoUpdateService.instance
  }

  // 开始监听更新消息
  startListening() {
    if (this.isListening) return

    this.isListening = true

    // 监听各种更新事件
    window.api.autoUpdater.onCheckingForUpdate(() => {
      this.showCheckingNotification()
    })

    window.api.autoUpdater.onUpdateAvailable((_, updateInfo: UpdateInfo) => {
      this.showUpdateAvailableDialog(updateInfo)
    })

    window.api.autoUpdater.onUpdateNotAvailable(() => {
      this.showNoUpdateNotification()
    })

    window.api.autoUpdater.onDownloadStarted((updateInfo: UpdateInfo) => {
      this.handleDownloadStarted(updateInfo)
    })

    window.api.autoUpdater.onDownloadProgress((progress: DownloadProgress) => {
      console.log(progress)

      this.showDownloadProgressNotification(progress)
    })

    window.api.autoUpdater.onUpdateDownloaded(() => {
      this.showUpdateDownloadedDialog()
    })

    window.api.autoUpdater.onError((_, error: string) => {
      this.showUpdateErrorNotification(error)
    })
  }

  // 停止监听更新消息
  stopListening() {
    if (!this.isListening) return

    this.isListening = false
    window.api.autoUpdater.removeAllListeners()
  }

  // 检查更新
  async checkForUpdates() {
    try {
      await window.api.autoUpdater.checkForUpdates()
    } catch (error) {
      console.error('检查更新失败:', error)
      NotifyPlugin.error({
        title: '更新检查失败',
        content: '无法检查更新，请稍后重试',
        duration: 3000
      })
    }
  }

  // 下载更新
  async downloadUpdate() {
    try {
      await window.api.autoUpdater.downloadUpdate()
    } catch (error) {
      console.error('下载更新失败:', error)
      NotifyPlugin.error({
        title: '下载更新失败',
        content: '无法下载更新，请稍后重试',
        duration: 3000
      })
    }
  }

  // 安装更新
  async quitAndInstall() {
    try {
      await window.api.autoUpdater.quitAndInstall()
    } catch (error) {
      console.error('安装更新失败:', error)
      NotifyPlugin.error({
        title: '安装更新失败',
        content: '无法安装更新，请稍后重试',
        duration: 3000
      })
    }
  }

  // 显示检查更新通知
  private showCheckingNotification() {
    NotifyPlugin.info({
      title: '检查更新',
      content: '正在检查是否有新版本...',
      duration: 2000
    })
  }

  // 显示有更新可用对话框
  private showUpdateAvailableDialog(updateInfo: UpdateInfo) {
    // 保存更新信息到状态中
    downloadState.updateInfo = updateInfo
    console.log(updateInfo)
    const releaseDate = new Date(updateInfo.pub_date).toLocaleDateString('zh-CN')

    const dialog = DialogPlugin.confirm({
      header: `发现新版本 ${updateInfo.name}`,
      body: `发布时间: ${releaseDate}\n\n更新说明:\n${updateInfo.notes || '暂无更新说明'}\n\n是否立即下载此更新？`,
      confirmBtn: '立即下载',
      cancelBtn: '稍后提醒',
      onConfirm: () => {
        this.downloadUpdate()
        dialog.hide()
      },
      onCancel: () => {
        console.log('用户选择稍后下载更新')
      }
    })
  }

  // 显示无更新通知
  private showNoUpdateNotification() {
    NotifyPlugin.info({
      title: '已是最新版本',
      content: '当前已是最新版本，无需更新',
      duration: 3000
    })
  }

  // 处理下载开始事件
  private handleDownloadStarted(updateInfo: UpdateInfo) {
    downloadState.isDownloading = true
    downloadState.updateInfo = updateInfo
    downloadState.progress = {
      percent: 0,
      transferred: 0,
      total: 0
    }

    console.log('开始下载更新:', updateInfo.name)
  }

  // 更新下载进度状态
  private showDownloadProgressNotification(progress: DownloadProgress) {
    // 更新响应式状态
    downloadState.isDownloading = true
    downloadState.progress = progress

    console.log(
      `下载进度: ${Math.round(progress.percent)}% (${this.formatBytes(progress.transferred)} / ${this.formatBytes(progress.total)})`
    )
  }

  // 显示更新下载完成对话框
  private showUpdateDownloadedDialog() {
    // 更新下载状态
    downloadState.isDownloading = false
    downloadState.progress.percent = 100

    DialogPlugin.confirm({
      header: '更新下载完成',
      body: '新版本已下载完成，是否立即重启应用以完成更新？',
      confirmBtn: '立即重启',
      cancelBtn: '稍后重启',
      onConfirm: () => {
        this.quitAndInstall()
      },
      onCancel: () => {
        console.log('用户选择稍后重启')
      }
    })
  }

  // 显示更新错误通知
  private showUpdateErrorNotification(error: string) {
    NotifyPlugin.error({
      title: '更新失败',
      content: `更新过程中出现错误: ${error}`,
      duration: 5000
    })
  }

  // 格式化字节大小
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// 导出单例实例
export const autoUpdateService = AutoUpdateService.getInstance()
