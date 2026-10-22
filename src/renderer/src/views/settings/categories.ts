export const settingsGroups = [
  { key: 'experience', label: '聆听体验' },
  { key: 'services', label: '内容与扩展' },
  { key: 'application', label: '应用管理' }
] as const

export const settingsCategories = [
  { key: 'appearance', group: 'experience', label: '外观与主题', description: '调整主题颜色、窗口风格和全局背景。' },
  { key: 'playlist', group: 'experience', label: '播放与音效', description: '管理播放列表、输出设备、均衡器和播放动效。' },
  { key: 'lyrics', group: 'experience', label: '歌词', description: '设置歌词字体、桌面歌词和状态栏歌词。' },
  { key: 'hotkeys', group: 'experience', label: '快捷键', description: '设置全局快捷键，随时控制音乐播放。' },
  { key: 'music', group: 'services', label: '音乐源与音质', description: '选择音乐来源、平台实现和默认播放音质。' },
  { key: 'plugins', group: 'services', label: '插件管理', description: '安装与管理插件，分配插件提供的能力。' },
  { key: 'ai', group: 'services', label: 'AI 助手', description: '配置 DeepSeek 服务和 AI 浮球。' },
  { key: 'storage', group: 'application', label: '下载与存储', description: '管理下载目录、文件命名、标签和本地缓存。' },
  { key: 'network', group: 'application', label: '网络与代理', description: '配置网络代理和系统证书信任。' },
  { key: 'system', group: 'application', label: '系统与性能', description: '调整窗口关闭行为、页面预加载和系统媒体集成。' },
  { key: 'about', group: 'application', label: '关于与更新', description: '检查应用更新，了解版本信息和开发团队。' }
] as const

export type SettingsCategoryKey = (typeof settingsCategories)[number]['key']

export function getSettingsCategoryLabel(key: string) {
  return settingsCategories.find((category) => category.key === key)?.label || '设置'
}

// 保留旧链接的锚点，在调整分类后仍能定位到对应设置。
export function resolveSettingsCategory(category: string, section = ''): SettingsCategoryKey | undefined {
  if (['appearance-lyric-font', 'appearance-desktop-lyric', 'appearance-mac-status-lyric'].includes(section)) return 'lyrics'
  if (['appearance-close-behavior', 'playback-route-preload', 'playback-smtc-hires'].includes(section)) return 'system'
  return settingsCategories.find((item) => item.key === category)?.key
}
