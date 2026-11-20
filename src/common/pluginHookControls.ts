export type HookName = import('@shiqianjiang/ceru-plugin-sdk').HookOperationName | 'router.navigate'
export const hookLabels: Record<HookName, string> = {
  'router.navigate': '页面跳转',
  'account.switch': '切换子账号',
  'window.close': '关闭窗口',
  'lyrics.load': '加载歌词',
  'lyrics.transform': '处理歌词',
  'download.create': '创建下载',
  'download.filename': '下载文件名',
  'share.create': '创建歌曲分享',
  'link.open': '打开链接',
  'notification.show': '软件内提示',
  'track.like': '收藏歌曲',
  'playlist.create': '创建歌单',
  'playlist.delete': '删除歌单',
  'playlist.addTracks': '添加歌单歌曲',
  'playlist.removeTracks': '移除歌单歌曲',
  'playlist.export': '导出歌单',
  'playlist.import': '导入歌单',
  'player.resolve': '解析播放地址',
  'search.query': '搜索词',
  'search.suggest': '搜索建议',
  'search.results': '搜索结果',
  'player.play': '点播',
  'queue.add': '入队',
  'queue.shuffle': '随机播放排序',
  'player.pause': '暂停',
  'player.resume': '继续播放',
  'queue.remove': '移除队列歌曲',
  'queue.clear': '清空队列',
  'player.next': '下一首',
  'player.error': '播放失败',
  'player.queueEnded': '队列播完',
  'player.previous': '上一首',
  'player.seek': '跳转进度',
  'player.setVolume': '调节音量',
  'player.setMode': '切换播放模式'
}
export interface HookPauseEntry {
  pluginId: string
  name: HookName
}
export const hookChangeLabels = {
  track: '歌曲',
  tracks: '歌曲列表',
  order: '歌曲顺序',
  count: '歌曲数量',
  position: '入队位置',
  positionMs: '播放进度（毫秒）',
  volume: '音量',
  mode: '播放模式',
  queueIndex: '队列位置',
  reason: '切歌原因',
  quality: '音质',
  liked: '收藏状态',
  name: '名称',
  format: '格式',
  value: '导入内容',
  importer: '导入方式',
  query: '搜索词',
  suggestions: '搜索建议',
  results: '搜索结果',
  route: '目标页面',
  params: '页面参数',
  queryParams: '页面查询参数',
  url: '链接',
  title: '提示标题',
  body: '提示内容',
  level: '提示级别',
  lyric: '歌词内容',
  lines: '歌词行数',
  result: '返回结果'
} as const
export interface HookActivityChange {
  field: keyof typeof hookChangeLabels
  /** Only host-generated enums, bounded numbers and booleans. No user/plugin text. */
  before?: string | number | boolean
  after?: string | number | boolean
  redacted?: true
}
export interface HookActivitySummary {
  target: 'input' | 'result' | 'cancel'
  changes: HookActivityChange[]
}
export interface HookActivity {
  time: number
  pluginId: string
  name: HookName
  action: 'cancel' | 'rewrite'
  source: 'ui' | 'plugin' | 'system'
  /** Absent for records produced by an older runtime. */
  summary?: HookActivitySummary
}
export interface HookControls {
  paused: boolean
  announce: boolean
  invalid: boolean
  suspended: HookPauseEntry[]
  activity: HookActivity[]
}
export interface HookControlChange {
  paused?: boolean
  announce?: boolean
  entry?: HookPauseEntry
  suspend?: false
}
export interface HookSnapshot {
  revision: number
  names: string[]
  announce?: boolean
}
