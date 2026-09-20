import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk'

const standard: Record<string, readonly [string, string]> = {
  'tracks.search': ['歌曲搜索', '查找歌曲、歌手和专辑'],
  'tracks.resolve': ['播放解析', '获取歌曲播放地址和音质'],
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

/** Protocol names belong to the app; custom action copy belongs to the plugin. */
export function describePluginCapability(
  capability: string,
  manifest: Pick<PluginManifest, 'name' | 'contributes'>
): { label: string; description: string } {
  const fallback = standard[capability]
  if (capability.startsWith('action:')) {
    const command = manifest.contributes?.commands?.find(
      (entry) => entry.action === capability.slice('action:'.length)
    )
    const title = command?.title.trim()
    if (title)
      return {
        label: title,
        description:
          command?.description?.trim() || fallback?.[1] || `由${manifest.name}提供${title}功能`
      }
  }
  return fallback
    ? { label: fallback[0], description: fallback[1] }
    : { label: '自定义功能', description: `由${manifest.name}提供，插件尚未声明功能说明` }
}
