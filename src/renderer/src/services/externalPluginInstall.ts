import { h } from 'vue'
import { DialogPlugin, MessagePlugin, Select } from 'tdesign-vue-next'
import { refreshPluginContributions } from './pluginState'

export async function showExternalPluginInstall(sequence: number): Promise<void> {
  try {
    const info = await window.api.plugins.prepareExternal(sequence)
    let format = info.formats[0]?.value
    const accepted = await new Promise<boolean>((resolve) => {
      const finish = (value: boolean) => {
        dialog.destroy()
        resolve(value)
      }
      const dialog = DialogPlugin.confirm({
        header: info.update ? '更新插件' : '安装插件',
        zIndex: 1000010,
        body: () =>
          h('div', { style: 'display:grid;gap:12px' }, [
            h('strong', `${info.name} ${info.version}`),
            info.description ? h('p', info.description) : null,
            h(
              'p',
              info.update
                ? '更新将保留当前配置和授权。'
                : '安装后保存在插件列表，点击“使用”才会运行。'
            ),
            info.formats.length
              ? h(Select, {
                  options: info.formats,
                  defaultValue: format,
                  onChange: (value) => {
                    format = String(value)
                  }
                })
              : null
          ]),
        confirmBtn: info.update ? '更新' : '安装',
        cancelBtn: '取消',
        onConfirm: () => finish(true),
        onCancel: () => finish(false),
        onClose: () => finish(false)
      })
    })
    if (!accepted) return
    const result = await window.api.plugins.commitExternal(sequence, format)
    if (result?.error) throw new Error(result.error)
    if (result === null || result?.canceled) return
    MessagePlugin.success(info.update ? '插件已更新' : '插件已安装，可在设置中的插件列表使用')
    void refreshPluginContributions(true).catch(console.warn)
  } catch (error: any) {
    MessagePlugin.error(error?.message || '插件安装失败')
  } finally {
    await window.api.plugins.discardExternal(sequence)
  }
}
