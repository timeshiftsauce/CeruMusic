import type { LocalMusicTags } from '@common/types/localMusicMetadata'

type MetadataReader = {
  getTags(id: string, includeLyrics: boolean): Promise<LocalMusicTags | null>
  getCoverBase64(id: string): Promise<string>
}

export async function readLocalMusicMetadata(
  id: string,
  api: MetadataReader = window.api.localMusic
) {
  const [tags, img] = await Promise.all([api.getTags(id, true), api.getCoverBase64(id)])
  if (!tags) throw new Error('无法读取本地音乐标签，请确认文件存在且可访问')
  return { ...tags, img: img || '', lrc: tags.lrc || '' }
}
