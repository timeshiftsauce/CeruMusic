/** Only capabilities consumed by the host participate in cross-plugin routing. */
export const ROUTABLE_PLUGIN_CAPABILITIES: Record<string, readonly [string, string]> = {
  'tracks.search': ['歌曲搜索', '查找歌曲、歌手和专辑'],
  'tracks.resolve': ['播放解析', '选择歌曲播放和下载使用的音源'],
  'tracks.lyrics': ['歌词', '获取逐行、逐字歌词和翻译'],
  'playlists.search': ['歌单搜索', '搜索平台公开歌单'],
  'playlists.categories': ['歌单分类', '获取歌单风格、场景等分类'],
  'playlists.list': ['歌单浏览', '浏览所选分类下的歌单'],
  'playlists.get': ['歌单详情', '读取歌单介绍和歌曲列表'],
  'charts.list': ['排行榜', '获取平台的排行榜目录'],
  'charts.getTracks': ['榜单歌曲', '读取所选排行榜的歌曲'],
  'sharing.describe': ['歌曲分享', '生成歌曲的分享信息'],
  'action:search.tips': ['搜索建议', '输入关键词时提供搜索建议'],
  'action:search.hot': ['热门搜索', '获取平台热门搜索词'],
  'action:comments.hot': ['热门评论', '获取歌曲的热门评论'],
  'action:comments.get': ['最新评论', '分页读取歌曲评论'],
  'action:artwork.get': ['歌曲封面', '获取或补全歌曲封面'],
  'action:playlist.parse': ['歌单链接识别', '识别歌单链接或歌单编号'],
  'action:recognize': ['听歌识曲', '根据音频片段识别歌曲'],
  'action:album.list': ['专辑歌曲', '读取专辑信息和歌曲列表']
}

export function isRoutablePluginCapability(capability: string): boolean {
  return Object.hasOwn(ROUTABLE_PLUGIN_CAPABILITIES, capability)
}

// Old settings incorrectly exposed adapter commands alongside their provider methods.
// Migrate saved choices only; commands remain private and keep their own input contracts.
const legacyCapabilities: Record<string, string> = {
  'action:search': 'tracks.search',
  'action:music.resolve': 'tracks.resolve',
  'action:lyrics.get': 'tracks.lyrics',
  'action:playlist.search': 'playlists.search',
  'action:playlist.tags': 'playlists.categories',
  'action:playlist.list': 'playlists.list',
  'action:playlist.detail': 'playlists.get',
  'action:rank.boards': 'charts.list',
  'action:rank.list': 'charts.getTracks',
  'action:share.create': 'sharing.describe'
}

export function migratePluginCapabilitySelections(
  saved: Record<string, string> = {}
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, pluginId] of Object.entries(saved)) {
    const separator = key.indexOf(':')
    if (separator < 1) continue
    const source = key.slice(0, separator)
    const capability = key.slice(separator + 1)
    const canonical = legacyCapabilities[capability] ?? capability
    if (!isRoutablePluginCapability(canonical)) continue
    const target = `${source}:${canonical}`
    // A choice made in the real provider selector takes precedence over an old alias.
    next[target] = saved[target] ?? pluginId
  }
  return next
}
