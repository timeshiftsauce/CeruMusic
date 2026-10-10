import { NotifyPlugin, DialogPlugin } from 'tdesign-vue-next'

import { reactive, h, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/** 更新说明以 Markdown 渲染（marked + DOMPurify）。同步返回，便于在弹窗 body 里直接用。 */
function renderNotesMarkdown(notes?: string): string {
  const source = (notes || '').trim()
  if (!source) return '<p>暂无更新说明</p>'
  try {
    const html = marked.parse(source, { async: false, gfm: true, breaks: true }) as string
    return DOMPurify.sanitize(html)
  } catch (e) {
    console.warn('更新说明 Markdown 渲染失败，回退为纯文本:', e)
    return DOMPurify.sanitize(`<pre>${source}</pre>`)
  }
}

/** 弹窗正文：标题行 + Markdown 更新说明 + 尾部追问。 */
function notesBody(options: { releaseDate: string; notes?: string; tail?: string }) {
  const { releaseDate, notes, tail } = options
  return h('div', { style: 'max-height: 60vh; overflow-y: auto' }, [
    h('div', { style: 'margin-bottom: 6px; font-weight: 600' }, `发布时间: ${releaseDate}`),
    h('div', { style: 'margin-bottom: 6px; font-weight: 600' }, '更新说明:'),
    h('div', {
      class: 'ceru-update-notes',
      innerHTML: renderNotesMarkdown(notes)
    }),
    tail
      ? h('div', { style: 'margin-top: 10px; white-space: pre-line' }, tail)
      : null
  ])
}

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
  supportsDifferential?: boolean
  mode?: 'differential' | 'full'
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

    window.api.autoUpdater.onError(
      (error: string | { code?: string; message: string; raw?: string }) => {
        this.showUpdateErrorNotification(error)
      }
    )

    window.api.autoUpdater.onDifferentialFallback((info: { reason: string }) => {
      this.showDifferentialFallbackNotification(info?.reason)
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
  //  - mode: 'differential' | 'full'
  //  - mirror: GitHub 代理前缀（空 = 原生直连）
  async downloadUpdate(mode?: 'differential' | 'full', mirror = '') {
    try {
      await window.api.autoUpdater.downloadUpdate(mode, mirror)
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
            body: () =>
              notesBody({
                releaseDate,
                notes: updateInfo.notes,
                tail: '是否继续在后台下载安装？'
              }),
            confirmBtn: '继续下载',
            cancelBtn: '稍后再说',
            closeBtn: true,
            onClose: () => dialog.destroy(),
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
      const dialog = DialogPlugin.confirm({
        header: `新版本 ${updateInfo.name} 已下载`,
        body: () =>
          notesBody({
            releaseDate,
            notes: updateInfo.notes,
            tail: '是否立即安装？'
          }),
        confirmBtn: '立即安装',
        cancelBtn: '稍后再说',
        closeBtn: true,
        onClose: () => dialog.destroy(),
        onConfirm: () => {
          this.quitAndInstall()
        }
      })
      return
    }

    const dialog = DialogPlugin.confirm({
      header: `发现新版本 ${updateInfo.name}`,
      body: () =>
        notesBody({
          releaseDate,
          notes: updateInfo.notes,
          tail: updateInfo.supportsDifferential
            ? '是否立即下载此更新？(下一步可选择更新方式)'
            : '是否立即下载此更新？'
        }),
      confirmBtn: '立即下载',
      cancelBtn: '稍后提醒',
      closeBtn: true,
      onClose: () => dialog.destroy(),
      onConfirm: () => {
        dialog.hide()
        // 先选「下载方式」（原生直连 / 代理镜像），再进入差分/全量选择。
        this.askChannelAndDownload()
      }
    })
  }

  /**
   * 「选择下载方式」面板：**一个列表**并列「原生直连 + 服务端下发的全部镜像」。
   *
   * 第一行固定是原生直连（同时显示其延迟），其余镜像按延迟升序；
   * 测速失败的镜像保留在末尾并标「超时」（置灰，可手动选作备用）。
   * 列表可滚动，默认选中第一行（直连）。测速期间显示「测速中…」。
   */
  private async askChannelAndDownload() {
    // 占位框：先渲染「测速中」，测完替换为列表。
    const dialog = DialogPlugin.confirm({
      header: '选择下载方式',
      body: () =>
        h(
          'div',
          { style: 'min-height: 80px; line-height: 1.8' },
          '正在测速全部镜像，请稍候…（首次可能需要几秒）'
        ),
      confirmBtn: '取消',
      cancelBtn: '取消',
      closeBtn: true,
      onClose: () => dialog.destroy(),
      onConfirm: () => dialog.hide(),
      onCancel: () => dialog.hide()
    })

    let ranked: Array<{ url: string; ms: number | null }> = []
    try {
      ranked = (await window.api.autoUpdater.probeMirrors()) || []
    } catch (e) {
      console.warn('镜像测速失败:', e)
    }
    dialog.destroy()

    // 兜底：测速完全失败时也要能选（至少给出「原生直连」）。
    if (!ranked.length) ranked = [{ url: '', ms: null }]

    const choice = ref<number>(0)
    // 可用（含直连）的数量：用于表头统计。直连即使超时也要计入。
    const okCount = ranked.filter((r) => r.ms != null).length

    const picker = DialogPlugin.confirm({
      header: `选择下载方式（可用 ${okCount}/${ranked.length}，按延迟升序）`,
      body: () =>
        h(
          'div',
          { style: 'max-height: 50vh; overflow-y: auto; padding-right: 4px' },
          ranked.map((item, index) => {
            const isDirect = item.url === ''
            const failed = item.ms == null
            const label = isDirect ? '原生直连（GitHub）' : item.url
            const speed = failed ? '超时' : `${item.ms} ms`
            return h(
              'label',
              {
                key: (isDirect ? 'direct' : item.url) + index,
                style:
                  'display:flex;align-items:center;gap:8px;padding:8px 4px;cursor:pointer;' +
                  (failed ? 'opacity:0.5;' : '') +
                  (index ? 'border-top:1px solid var(--td-component-stroke,rgba(0,0,0,.06));' : '')
              },
              [
                h('input', {
                  type: 'radio',
                  name: 'ceru-update-channel',
                  value: String(index),
                  checked: choice.value === index,
                  onChange: () => {
                    choice.value = index
                  }
                }),
                h(
                  'span',
                  {
                    style: `flex:1;word-break:break-all${isDirect ? ';font-weight:600' : ''}`
                  },
                  label
                ),
                h(
                  'span',
                  {
                    style:
                      'white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--td-text-color-secondary,#888);'
                  },
                  speed
                )
              ]
            )
          })
        ),
      confirmBtn: '开始下载',
      cancelBtn: '取消',
      closeBtn: true,
      onClose: () => picker.destroy(),
      onConfirm: () => {
        const chosen = ranked[choice.value]
        picker.hide()
        // url 为空串 = 原生直连
        this.afterChannelChosen(chosen?.url || '')
      },
      onCancel: () => picker.hide()
    })
  }

  /** 下载方式确定后：若支持差分则再问差分/全量，否则直接全量。 */
  private afterChannelChosen(mirror: string) {
    const info = downloadState.updateInfo
    if (info?.supportsDifferential) {
      this.askModeAndDownload(mirror)
    } else {
      this.downloadUpdate('full', mirror)
    }
  }

  // 询问用户选择更新方式 (差分/全量)
  private askModeAndDownload(mirror = '') {
    const dialog = DialogPlugin.confirm({
      header: '选择更新方式',
      body: () => {
        const content =
          '差分更新: 仅下载变化的部分,体积小、速度快,推荐使用\n\n全量更新: 重新下载完整安装包,适用于差分失败时的备用方案'
        return h(
          'div',
          { style: 'white-space: pre-line; max-height: 60vh; overflow-y: auto' },
          content
        )
      },
      confirmBtn: '差分更新 (推荐)',
      cancelBtn: '全量更新',
      closeBtn: true,
      onClose: () => dialog.destroy(),
      onConfirm: () => {
        this.downloadUpdate('differential', mirror)
        dialog.hide()
      },
      onCancel: () => {
        this.downloadUpdate('full', mirror)
        dialog.hide()
      }
    })
  }

  // 显示无更新通知
  private showNoUpdateNotification() {
    NotifyPlugin.info({
      title: '已是最新版本',
      content: '当前已是最新版本，无需更新',
      closeBtn: true,
      duration: 1500
    })
  }

  // 处理下载开始事件
  private handleDownloadStarted(updateInfo: UpdateInfo) {
    downloadState.isDownloading = false
    downloadState.updateInfo = updateInfo
    downloadState.progress = { percent: 0, transferred: 0, total: 0 }
    const isDifferential = updateInfo.mode === 'differential'
    NotifyPlugin.info({
      title: '开始下载更新',
      content: isDifferential
        ? '正在以差分方式下载,完成后将提示安装'
        : '已加入下载管理，可在“下载管理”查看进度',
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

    const dialog = DialogPlugin.confirm({
      header: '更新下载完成',
      body: '新版本已下载完成，是否立即重启应用以完成更新？',
      confirmBtn: '立即重启',
      cancelBtn: '稍后重启',
      closeBtn: true,
      onClose: () => dialog.destroy(),
      onConfirm: () => {
        this.quitAndInstall()
      },
      onCancel: () => {
        console.log('用户选择稍后重启')
      }
    })
  }

  // 显示更新错误通知
  private showUpdateErrorNotification(
    error: string | { code?: string; message?: string; raw?: string } | null | undefined
  ) {
    if (!error) {
      NotifyPlugin.error({
        title: '更新失败',
        content: '未知错误,请稍后重试',
        duration: 5000
      })
      return
    }

    if (typeof error === 'string') {
      NotifyPlugin.error({
        title: '更新失败',
        content: error,
        duration: 5000
      })
      return
    }

    // 结构化错误: 主进程已经把 ENOTFOUND/ETIMEDOUT 等翻译成中文 message
    const friendly = error.message || error.raw || '未知错误,请稍后重试'
    const lines = [friendly]
    if (error.code && friendly !== error.code) lines.push(`错误代码: ${error.code}`)
    NotifyPlugin.error({
      title: '更新失败',
      content: lines.join('\n'),
      duration: 6000
    })
  }

  // 差分下载失败,自动回退全量时的提示
  private showDifferentialFallbackNotification(reason?: string) {
    NotifyPlugin.warning({
      title: '差分更新失败',
      content: `${reason || '差分下载失败'}, 已自动切换到全量下载`,
      duration: 4000
    })
  }

  // 格式化字节大小
}

// 导出单例实例
export const autoUpdateService = AutoUpdateService.getInstance()
