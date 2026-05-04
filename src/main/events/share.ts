import { ipcMain } from 'electron'
import * as crypto from 'crypto'
import pluginService from '../services/plugin'

/**
 * 分享相关 IPC：仅暴露最小必要能力 —— 获取当前插件的源码 + md5 指纹。
 * 真正的 HTTP 调用（precheck / upload-plugin / create）由 renderer 通过已封装好的
 * Request（带 Logto Bearer）发起，避免主进程二次实现鉴权。
 */
export default function InitShareService() {
  ipcMain.handle(
    'service-share-getPluginCodeAndMd5',
    async (
      _,
      pluginId: string
    ): Promise<{ code: string; md5: string; type: 'cr' | 'lx' } | { error: string }> => {
      try {
        const host = pluginService.getPluginById(pluginId)
        if (!host) return { error: `插件 ${pluginId} 未加载` }
        const code = host.getPluginCode()
        if (!code) return { error: '无法读取插件源码' }
        const md5 = crypto.createHash('md5').update(code).digest('hex')
        // 推断类型：根据现有 selectAndAddPlugin 的判断口径
        const lower = code.toLowerCase()
        let type: 'cr' | 'lx' = 'cr'
        if (lower.includes('cerumusic')) type = 'cr'
        else if (lower.includes('lx')) type = 'lx'
        return { code, md5, type }
      } catch (err: any) {
        return { error: err?.message || '获取插件源码失败' }
      }
    }
  )
}
