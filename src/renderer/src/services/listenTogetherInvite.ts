/**
 * 一起听 · 邀请入口统一调度
 *
 * 触发来源(共用一份对话框 + 去重逻辑):
 *  1. 主进程 deeplink (cerumusic://lt/<code>) → IPC `lt-share-open`
 *  2. 应用启动 / 窗口重新聚焦时主动读剪贴板
 *  3. 用户手动复制分享文案后切到发现页(onActivated 触发)
 *
 * 设计要点:
 *  - 优先用主进程 IPC 读剪贴板,绕过 Electron renderer focus / 权限限制
 *  - 已登录走 POST /resolve 拿到 ownerId,识别"自己的房间"静默放行
 *  - 未登录走公开 GET /lt/:code,弹"加入需登录"
 *  - `dismissedCodes` 是模块级 Set,会话内防重复弹;客户端重启会重新提示
 */

import { h } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { extractCodeFromShareText } from '@renderer/components/ListenTogether/parts/shareTextHelper'
import { getRoomPreview, resolveRoom } from '@renderer/api/listenTogether'
import { useAuthStore } from '@renderer/store/Auth'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'

const dismissedCodes = new Set<string>()
let running = false

export type InviteTriggerSource = 'deeplink' | 'clipboard'

/** 读剪贴板 —— 优先主进程,失败时降级到 navigator.clipboard */
async function readClipboardText(): Promise<string> {
  /* 1) 通过 electron.ipcRenderer.invoke 直接调主进程 IPC ——
   *    与 Provider.vue 中其他主进程调用保持一致,不依赖 preload 的 window.api.* 包装层,
   *    避免 preload bundle 未重编时 window.api.clipboard 是 undefined。 */
  try {
    const fromMain = await (window as any).electron?.ipcRenderer?.invoke?.('clipboard:read-text')
    if (typeof fromMain === 'string' && fromMain.length > 0) return fromMain
  } catch (e) {
    console.warn('[lt-invite] 主进程剪贴板 IPC 失败:', e)
  }
  /* 2) 同样作为兜底也试一下 window.api.clipboard(若 preload 重编了) */
  try {
    const fromApi = await (window as any).api?.clipboard?.readText?.()
    if (typeof fromApi === 'string' && fromApi.length > 0) return fromApi
  } catch {}
  /* 3) 最后兜底:navigator.clipboard —— 焦点时序不对可能返回空,可接受 */
  try {
    return (await navigator.clipboard.readText()) || ''
  } catch (e) {
    console.warn('[lt-invite] navigator.clipboard 读取失败:', e)
    return ''
  }
}

/**
 * 提取 / 校验 code 并弹出加入对话框
 *
 * @param source 触发来源(目前仅用于日志区分)
 * @param explicitCode deeplink 路径直接传入的 code;省一次剪贴板读
 */
export async function tryShowListenTogetherInvite(
  source: InviteTriggerSource,
  explicitCode?: string | null
): Promise<void> {
  if (running) return
  running = true
  try {
    const lt = useListenTogetherStore()
    if (lt.isInRoom) return

    let code: string | null = null
    if (explicitCode) {
      code = explicitCode.toUpperCase()
    } else {
      const text = await readClipboardText()
      code = extractCodeFromShareText(text)
    }
    if (!code) return
    if (dismissedCodes.has(code)) return

    const auth = useAuthStore()
    const isLoggedIn = Boolean(auth.isAuthenticated)

    if (!isLoggedIn) {
      const preview = await getRoomPreview(code)
      if (!preview) {
        dismissedCodes.add(code)
        return
      }
      dismissedCodes.add(code)
      const dialog = DialogPlugin.confirm({
        header: '加入一起听需要登录',
        body: () =>
          h('div', { style: 'line-height: 1.7; max-width: 360px;' }, [
            h('div', { style: 'color: var(--td-text-color-secondary); margin-bottom: 8px;' }, [
              '检测到剪贴板里有一起听房间口令'
            ]),
            h(
              'div',
              {
                style: 'font-size: 16px; font-weight: 600; color: var(--td-text-color-primary);'
              },
              [preview.name]
            ),
            h(
              'div',
              {
                style: 'font-size: 12px; color: var(--td-text-color-secondary); margin-top: 6px;'
              },
              [`房间口令 #${preview.code}#`]
            )
          ]),
        confirmBtn: '去登录',
        cancelBtn: '稍后',
        onConfirm: () => {
          dialog.hide()
          void auth.login()
        },
        onClose: () => dialog.hide()
      })
      return
    }

    /* 已登录:用 POST /resolve 拿到 ownerId,识别"自己的房间"直接放行 */
    let preview: Awaited<ReturnType<typeof resolveRoom>> = null
    try {
      preview = await resolveRoom({ code })
    } catch (e) {
      console.warn('[lt-invite] resolveRoom failed:', e)
      // 网络异常:不要标记 dismissed,让用户切回来还能再试
      return
    }
    if (!preview) {
      dismissedCodes.add(code)
      return
    }

    const myUserId = auth.user?.sub || lt.myUserId
    if (myUserId && preview.ownerId === myUserId) {
      // 自己的房间 —— 静默放行,不打扰
      dismissedCodes.add(code)
      return
    }

    dismissedCodes.add(code)
    const modeLabel = preview.mode === 'intimate' ? '亲密模式' : '多人房间'
    const dialog = DialogPlugin.confirm({
      header: '加入一起听',
      body: () =>
        h('div', { style: 'line-height: 1.7; max-width: 360px;' }, [
          h('div', { style: 'color: var(--td-text-color-secondary); margin-bottom: 8px;' }, [
            source === 'deeplink' ? '来自分享链接的一起听邀请' : '朋友邀请你加入一起听房间'
          ]),
          h(
            'div',
            {
              style:
                'font-size: 18px; font-weight: 700; color: var(--td-text-color-primary); margin-bottom: 6px;'
            },
            [preview.name]
          ),
          h(
            'div',
            {
              style: 'font-size: 12px; color: var(--td-text-color-secondary);'
            },
            [`${modeLabel} · 最多 ${preview.maxMembers} 人`]
          ),
          h(
            'div',
            {
              style:
                'margin-top: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; letter-spacing: 3px; color: var(--td-text-color-primary);'
            },
            [`#${preview.code}#`]
          )
        ]),
      confirmBtn: '立即加入',
      cancelBtn: '稍后',
      onConfirm: async () => {
        dialog.hide()
        try {
          await lt.resolveAndJoin(preview!.code)
          lt.openOverlay()
        } catch (e: any) {
          MessagePlugin.error(e?.message || '加入失败,请稍后重试')
        }
      },
      onClose: () => dialog.hide()
    })
  } finally {
    running = false
  }
}

/** 调试用:清掉所有 dismissed 记录(开发态切换账号 / 测试反复弹时用) */
export function resetListenTogetherInviteDedup(): void {
  dismissedCodes.clear()
}
