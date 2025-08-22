// 全局类型定义
declare namespace LX {
  namespace Music {
    // 音质类型
    type QualityType = 'flac24bit' | 'flac' | '320k' | '192k' | '128k' | 'ape' | 'wav'

    // 音质信息
    interface Quality {
      type: QualityType
      size?: string
    }

    // 基础音乐信息
    interface MusicInfoBase {
      id: string
      name: string
      singer: string
      source: string
      interval: string | number
    }

    // 本地音乐元数据
    interface MusicInfoLocalMeta {
      songId: string
      albumName?: string
      picUrl?: string
      filePath: string
      ext: string
    }

    // 在线音乐元数据
    interface MusicInfoOnlineMeta {
      songId: string
      albumName?: string
      picUrl?: string
      albumId?: string
      qualitys: Quality[]
      _qualitys: Record<QualityType, boolean>
      // 酷狗特有
      hash?: string
      // 腾讯音乐特有
      strMediaMid?: string
      id?: string
      albumMid?: string
      // 咪咕特有
      copyrightId?: string
      lrcUrl?: string
      mrcUrl?: string
      trcUrl?: string
    }

    // 本地音乐信息
    interface MusicInfoLocal extends MusicInfoBase {
      source: 'local'
      meta: MusicInfoLocalMeta
    }

    // 在线音乐信息
    interface MusicInfoOnline extends MusicInfoBase {
      source: 'kg' | 'tx' | 'mg' | 'kw' | 'wy'
      meta: MusicInfoOnlineMeta
    }

    // 统一音乐信息类型
    type MusicInfo = MusicInfoLocal | MusicInfoOnline
  }
}
