const mapSongsToCloud = (songs: readonly any[]): any[] => {
  const origin = songs
    .map((s) => {
      const _origin = {
        songmid: String(s.songmid),
        hash: s.hash,
        name: s.name,
        albumId: String(s.albumId),
        albumName: s.albumName,
        singer: s.singer,
        source: s.source,
        interval: s.interval,
        img: s.img,
        types: s.types || []
      }
      if (!_origin.hash) delete _origin.hash
      return _origin
    })
    .filter((s) => s.source !== 'local')
  return origin
}

/**
 * 将云端的歌曲数据映射为本地格式的函数
 * @param s - 输入的歌曲数据对象，包含云端歌曲的完整信息
 * @returns - 返回映射后的本地格式歌曲数据对象
 */
const mapCloudSongToLocal = (s: any): any => {
  return {
    songmid: s.songmid, // 歌曲的唯一标识ID
    hash: s.hash, // 歌曲的哈希值，用于唯一标识
    name: s.name, // 歌曲名称
    albumId: s.albumId, // 专辑ID
    albumName: s.albumName, // 专辑名称
    singer: s.singer, // 歌手信息
    source: s.source, // 歌曲来源
    interval: s.interval,
    img: s.img, // 歌曲封面图片链接
    types: s.types || [], // 歌曲类型数组，如果没有则设为空数组
    // 处理歌曲类型信息，将数组转换为对象格式
    _types: s.types.reduce((acc: any, t: any) => {
      acc[t.type] = { size: t.size, hash: t.hash } // 为每种类型创建包含大小和哈希值的对象
      if (!t.hash) delete acc[t.type].hash // 如果没有哈希值，则删除该属性
      return acc
    }, {})
  }
}

export { mapSongsToCloud, mapCloudSongToLocal }
