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

const mapCloudSongToLocal = (s: any): any => {
  return {
    songmid: s.songmid,
    hash: s.hash,
    name: s.name,
    albumId: s.albumId,
    albumName: s.albumName,
    singer: s.singer,
    source: s.source,
    interval: s.interval,
    img: s.img,
    types: s.types || [],
    _types: s.types.reduce((acc: any, t: any) => {
      acc[t.type] = { size: t.size, hash: t.hash }
      if (!t.hash) delete acc[t.type].hash
      return acc
    }, {})
  }
}

export { mapSongsToCloud, mapCloudSongToLocal }
