import { DialogPlugin } from 'tdesign-vue-next'
import shareAPI from '@renderer/api/share'

/** Both share dialogs retain the original explicit upload confirmation. */
export async function ensureShareResolverUploaded(
  resolver: {
    code: string
    md5: string
    type: 'cr' | 'lx'
  },
  onProgress: (message: string) => void
): Promise<boolean> {
  onProgress('校验播放解析模块指纹...')
  if ((await shareAPI.precheck({ pluginMd5: resolver.md5 })).hasPlugin) return true
  onProgress('等待确认上传播放解析模块...')
  const accepted = await new Promise<boolean>((resolve) => {
    const dialog = DialogPlugin.confirm({
      header: '需要上传播放解析模块',
      body: '网页播放需要将当前音源的播放解析模块和所需音源凭据上传到澜音服务器，仅用于分享解析，不会公开。是否继续？',
      confirmBtn: '继续上传',
      cancelBtn: '取消',
      zIndex: 1000010,
      onConfirm: () => {
        dialog.destroy()
        resolve(true)
      },
      onCancel: () => {
        dialog.destroy()
        resolve(false)
      },
      onClose: () => {
        dialog.destroy()
        resolve(false)
      }
    })
  })
  if (!accepted) return false
  onProgress('上传播放解析模块...')
  const result = await shareAPI.uploadPlugin({
    pluginCode: resolver.code,
    md5: resolver.md5,
    type: resolver.type
  })
  if (!result.ok) throw new Error(result.message || '上传播放解析模块失败')
  return true
}
