import { defineStore } from 'pinia'

/**
 * 一起听个人偏好设置 —— 与 ListenTogether 业务状态分开
 *
 * ListenTogether store 维护"当前房间运行时状态"(成员/聊天/同步),会随离房清空。
 * 这里专门放"跨房间持久化的个人偏好",独立 store 避免业务 store 被 persist 全量
 * 持久化导致脏数据复活。pinia-plugin-persistedstate 默认序列化整个 state。
 *
 * 字段语义见各 setter / 注释。所有字段都有保守默认值,首次安装/缺字段时回退到默认。
 */

/** 弹幕字号缩放等级 —— 实际 px = LtDanmakuLayer 内部 FONT_SIZES * scale */
export type DanmakuFontScale = 0.8 | 1.0 | 1.2 | 1.5

/** 弹幕飞行速度缩放 —— 实际 duration = base / speed,值越大越快 */
export type DanmakuSpeed = 0.6 | 0.8 | 1.0 | 1.3 | 1.6

interface ListenTogetherSettingsState {
  /** 是否启用系统通知(操作系统通知中心,窗口失焦时弹) */
  enableSystemNotify: boolean
  /** 是否启用软件内通知(右下角 NotifyPlugin 卡片,FullPlay 收起 + 浮层关闭时弹) */
  enableInAppNotify: boolean
  /** 是否对 @ 你的消息走"强提示"(绕过节流 + requireInteraction) */
  enableMentionStrong: boolean
  /** 是否开启弹幕层(FullPlay 内 LtDanmakuLayer) */
  enableDanmaku: boolean
  /** 弹幕字体大小档位 */
  danmakuFontScale: DanmakuFontScale
  /** 弹幕速度档位 */
  danmakuSpeed: DanmakuSpeed
}

export const useListenTogetherSettingsStore = defineStore('listenTogetherSettings', {
  state: (): ListenTogetherSettingsState => ({
    enableSystemNotify: true,
    enableInAppNotify: true,
    enableMentionStrong: true,
    enableDanmaku: true,
    danmakuFontScale: 1.0,
    danmakuSpeed: 1.0
  }),
  actions: {
    setEnableSystemNotify(v: boolean): void {
      this.enableSystemNotify = v
    },
    setEnableInAppNotify(v: boolean): void {
      this.enableInAppNotify = v
    },
    setEnableMentionStrong(v: boolean): void {
      this.enableMentionStrong = v
    },
    setEnableDanmaku(v: boolean): void {
      this.enableDanmaku = v
    },
    setDanmakuFontScale(v: DanmakuFontScale): void {
      this.danmakuFontScale = v
    },
    setDanmakuSpeed(v: DanmakuSpeed): void {
      this.danmakuSpeed = v
    },
    /** 一键重置 —— 给 SettingsPanel 的"恢复默认"按钮用 */
    resetAll(): void {
      this.enableSystemNotify = true
      this.enableInAppNotify = true
      this.enableMentionStrong = true
      this.enableDanmaku = true
      this.danmakuFontScale = 1.0
      this.danmakuSpeed = 1.0
    }
  },
  persist: true
})
