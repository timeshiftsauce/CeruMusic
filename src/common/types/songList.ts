import PlayList from './playList'
export type Songs = PlayList

export type SongList = {
  id: string //hashId 对应歌单文件名.json
  name: string // 歌单名
  createTime: string
  updateTime: string
  description: string // 歌单描述
  coverImgUrl: string //歌单封面 默认第一首歌的图片
  source: 'local' | 'wy' | 'tx' | 'mg' | 'kg' | 'kw' // 来源
}
