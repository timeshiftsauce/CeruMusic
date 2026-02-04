export interface SearchItem {
  id: string
  category: string
  title: string
  description?: string
  keywords?: string[]
}

export const searchItems: SearchItem[] = [
  // Appearance
  {
    id: 'appearance-titlebar',
    category: 'appearance',
    title: '标题栏风格',
    description: '选择您喜欢的标题栏控制按钮风格',
    keywords: ['外观', '界面', '样式', 'traffic', 'windows']
  },
  {
    id: 'appearance-close-behavior',
    category: 'appearance',
    title: '关闭按钮行为',
    description: '设置点击窗口关闭按钮时的行为',
    keywords: ['退出', '最小化', '托盘']
  },
  {
    id: 'appearance-theme',
    category: 'appearance',
    title: '应用主题色',
    description: '选择应用的主题颜色',
    keywords: ['颜色', '皮肤', 'color']
  },
  {
    id: 'appearance-lyric-font',
    category: 'appearance',
    title: '歌词字体设置',
    keywords: ['字体', '大小', 'font']
  },
  {
    id: 'appearance-desktop-lyric',
    category: 'appearance',
    title: '桌面歌词样式',
    keywords: ['桌面', '歌词', 'desktop']
  },

  // AI
  {
    id: 'ai-api-config',
    category: 'ai',
    title: 'DeepSeek API 配置',
    description: '配置您的 DeepSeek API Key 以使用 AI 功能',
    keywords: ['key', 'token', '人工智能']
  },
  {
    id: 'ai-floatball',
    category: 'ai',
    title: 'AI 浮球设置',
    keywords: ['悬浮', '助手']
  },

  // Playback
  {
    id: 'playback-playlist',
    category: 'playlist',
    title: '播放列表管理',
    keywords: ['列表', 'list']
  },
  {
    id: 'playback-audio-output',
    category: 'playlist',
    title: '音频输出',
    keywords: ['输出', '设备', 'output']
  },
  {
    id: 'playback-equalizer',
    category: 'playlist',
    title: '音频均衡器',
    keywords: ['eq', '音效']
  },
  {
    id: 'playback-audio-effect',
    category: 'playlist',
    title: '高级音效处理',
    keywords: ['音效', 'dsp']
  },
  {
    id: 'playback-performance',
    category: 'playlist',
    title: '全屏播放-性能优化',
    keywords: ['跳动歌词', '背景动画', '可视化', '性能']
  },

  // Music Source
  {
    id: 'music-source',
    category: 'music',
    title: '音乐源选择',
    keywords: ['源', 'source', '平台']
  },
  {
    id: 'music-quality',
    category: 'music',
    title: '音质选择',
    keywords: ['音质', 'quality', '无损', 'flac']
  },

  // Storage
  {
    id: 'storage-directory',
    category: 'storage',
    title: '存储目录',
    keywords: ['目录', '路径', 'folder']
  },
  {
    id: 'storage-cache',
    category: 'storage',
    title: '缓存管理',
    keywords: ['清理', 'cache', 'clear']
  },
  {
    id: 'storage-cache-strategy',
    category: 'storage',
    title: '缓存策略',
    keywords: ['自动缓存']
  },
  {
    id: 'storage-filename',
    category: 'storage',
    title: '下载文件名格式设置',
    keywords: ['下载', '格式', 'template']
  },
  {
    id: 'storage-tags',
    category: 'storage',
    title: '下载标签写入设置',
    keywords: ['标签', 'tag', 'meta', '封面', '歌词']
  },

  // Hotkeys
  {
    id: 'hotkey-settings',
    category: 'hotkeys',
    title: '快捷键设置',
    description: '配置系统级全局快捷键',
    keywords: ['快捷键', 'key', 'shortcut']
  },

  // Plugins
  {
    id: 'plugin-settings',
    category: 'plugins',
    title: '插件管理',
    keywords: ['插件', 'extension']
  },

  // About
  {
    id: 'about-version',
    category: 'about',
    title: '版本信息',
    keywords: ['更新', 'update', 'version']
  },
  {
    id: 'about-tech',
    category: 'about',
    title: '技术栈&服务&友商',
    keywords: ['技术', 'tech']
  },
  {
    id: 'about-team',
    category: 'about',
    title: '开发团队',
    keywords: ['作者', 'developer']
  },
  {
    id: 'about-legal',
    category: 'about',
    title: '法律声明',
    keywords: ['协议', 'license']
  },
  {
    id: 'about-contact',
    category: 'about',
    title: '联系方式',
    keywords: ['qq', '群', '官网']
  }
]
