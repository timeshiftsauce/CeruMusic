/**
 * 媒体键（多媒体键）识别与拒绝：这类按键不能注册为 Electron 的 globalShortcut。
 *
 * Electron/Chromium 行为：把媒体键注册为 globalShortcut 会关闭应用自身的系统媒体控制（SMTC）发布，
 * 应用于是在系统媒体卡片、媒体键以及其它 SMTC 集成里全部消失（已用同一 Electron 运行时对照验证：
 * 仅增加 globalShortcut.register('MediaPlayPause', ...) 就会让 SMTC 会话消失，改回组合键后立即恢复）。
 *
 * 媒体键本应交给系统媒体会话处理——渲染进程的 navigator.mediaSession.setActionHandler 已经接管了
 * 播放/暂停与上/下一首，因此把它录成全局快捷键既没有额外收益，又会破坏系统集成。
 */

/** 媒体键的加速器名（小写比较；浏览器事件里的 MediaTrackNext/MediaTrackPrevious 由下方映射归一）。 */
const MEDIA_KEY_ACCELERATORS = new Set([
  'mediaplaypause',
  'mediaplay',
  'mediapause',
  'mediastop',
  'medianexttrack',
  'mediaprevioustrack',
  'mediafastforward',
  'mediarewind'
])

/** 浏览器 KeyboardEvent.key → Electron 加速器名（仅覆盖媒体键）。 */
const MEDIA_KEY_EVENT_NAMES: Record<string, string> = {
  MediaPlayPause: 'MediaPlayPause',
  MediaPlay: 'MediaPlay',
  MediaPause: 'MediaPause',
  MediaStop: 'MediaStop',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  MediaFastForward: 'MediaFastForward',
  MediaRewind: 'MediaRewind'
}

/**
 * 浏览器按键事件里的媒体键对应的加速器名；不是媒体键时返回 null。
 * Electron accelerator name for a browser media-key event, or null when the event key is not a media key.
 */
export const resolveMediaKeyFromEventKey = (eventKey: string): string | null =>
  MEDIA_KEY_EVENT_NAMES[eventKey] || null

/**
 * 加速器是否为媒体键：取最后一段键名比较，因此 `CommandOrControl+MediaPlayPause` 这类写法也能识别；
 * 大小写不敏感。
 * Whether an accelerator is a media key: the last key segment is compared, so forms such as
 * `CommandOrControl+MediaPlayPause` are caught as well; the comparison ignores case.
 */
export const isMediaKeyAccelerator = (accelerator: string): boolean => {
  const normalized = (accelerator || '').trim()
  if (!normalized) return false
  const keyPart = normalized.split('+').filter(Boolean).pop() || ''
  return MEDIA_KEY_ACCELERATORS.has(keyPart.toLowerCase())
}
