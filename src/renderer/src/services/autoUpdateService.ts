import { NotifyPlugin, DialogPlugin } from 'tdesign-vue-next'

import { reactive, h } from 'vue'

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
    return
    // NotifyPlugin.info({
    //   title: '检查更新',
    //   content: '正在检查是否有新版本...',
    //   duration: 2000,
    //   offset: [0, '4.25rem']
    // })
  }

  // 显示有更新可用对话框
  private async showUpdateAvailableDialog(updateInfo: UpdateInfo) {
    // 保存更新信息到状态中
    downloadState.updateInfo = updateInfo
    const releaseDate = new Date(updateInfo.pub_date).toLocaleDateString('zh-CN')

    // 先检测是否存在未完成的“应用更新”任务
    try {
      const tasks = await window.api.download.getTasks()
      const updateTask = (tasks || []).find((t: any) => t?.songInfo?.source === 'update')

      if (updateTask) {
        // 若已在进行中或排队中，则不打扰用户，提示后台下载中
        if (['downloading', 'queued'].includes(updateTask.status)) {
          NotifyPlugin.info({
            title: '正在后台下载更新',
            content: '已在“下载管理”继续下载，完成后将提示安装',
            duration: 2500
          })
          return
        }

        // 若是暂停状态，询问是否继续
        if (updateTask.status === 'paused') {
          const dialog = DialogPlugin.confirm({
            header: `发现未完成的更新 ${updateInfo.name}`,
            body: () => {
              const content = `发布时间: ${releaseDate}\n\n更新说明:\n${updateInfo.notes || '暂无更新说明'}\n\n是否继续在后台下载安装？`
              return h(
                'div',
                { style: 'white-space: pre-line; max-height: 60vh; overflow-y: auto' },
                content
              )
            },
            confirmBtn: '继续下载',
            cancelBtn: '稍后再说',
            onConfirm: () => {
              try {
                window.api.download.resumeTask(updateTask.id)
                NotifyPlugin.info({
                  title: '已继续下载',
                  content: '可在“下载管理”查看进度',
                  duration: 2000
                })
              } catch {}
              dialog.hide()
            }
          })
          return
        }
      }
    } catch {}

    // 优先检测是否已下载完成，若已下载则提示安装
    const path = await window.api.autoUpdater.getDownloadedPath(updateInfo)
    if (path) {
      DialogPlugin.confirm({
        header: `新版本 ${updateInfo.name} 已下载`,
        body: () => {
          const content = `发布时间: ${releaseDate}\n\n更新说明:\n${updateInfo.notes || '暂无更新说明'}\n\n是否立即安装？`
          return h(
            'div',
            { style: 'white-space: pre-line; max-height: 60vh; overflow-y: auto' },
            content
          )
        },
        confirmBtn: '立即安装',
        cancelBtn: '稍后再说',
        onConfirm: () => {
          this.quitAndInstall()
        }
      })
      return
    }

    const dialog = DialogPlugin.confirm({
      header: `发现新版本 ${updateInfo.name}`,
      body: () => {
        const content = `发布时间: ${releaseDate}\n\n更新说明:\n${updateInfo.notes || '暂无更新说明'}\n\n是否立即下载此更新？`
        return h(
          'div',
          { style: 'white-space: pre-line; max-height: 60vh; overflow-y: auto' },
          content
        )
      },
      confirmBtn: '立即下载',
      cancelBtn: '稍后提醒',
      onConfirm: () => {
        this.downloadUpdate()
        dialog.hide()
      }
    })
  }

  // 显示无更新通知
  private showNoUpdateNotification() {
    NotifyPlugin.info({
      title: '已是最新版本',
      content: '当前已是最新版本，无需更新',
      duration: 1500
    })
  }

  // 处理下载开始事件
  private handleDownloadStarted(updateInfo: UpdateInfo) {
    // 迁移到下载管理：不再显示覆盖层，提示用户前往“下载管理”查看
    downloadState.isDownloading = false
    downloadState.updateInfo = updateInfo
    downloadState.progress = { percent: 0, transferred: 0, total: 0 }
    NotifyPlugin.info({
      title: '开始下载更新',
      content: '已加入下载管理，可在“下载管理”查看进度',
      duration: 3000
    })
  }

  // 更新下载进度状态
  private showDownloadProgressNotification(progress: DownloadProgress) {
    // 已迁移到下载管理，保持兼容但不再显示覆盖层
    downloadState.progress = progress
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
}

// 导出单例实例
export const autoUpdateService = AutoUpdateService.getInstance()
