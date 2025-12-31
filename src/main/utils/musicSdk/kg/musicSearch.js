import { httpFetch } from '../../request'
import { decodeName, formatPlayTime } from '../../index'
import { formatSingerName } from '../utils'
import { getBatchMusicQualityInfo } from './quality_detail'

export default {
  limit: 30,
  total: 0,
  page: 0,
  allPage: 1,
  musicSearch(str, page, limit) {
    const searchRequest = httpFetch(
      `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(
        str
      )}&page=${page}&pagesize=${limit}&userid=0&clientver=&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`
    )
    return searchRequest.promise.then(({ body }) => body)
  },
  async handleResult(rawData) {
    let ids = new Set()
    const items = []

    rawData.forEach((item) => {
      const key = item.Audioid + item.FileHash
      if (!ids.has(key)) {
        ids.add(key)
        items.push(item)
      }

      for (const childItem of item.Grp || []) {
        const childKey = childItem.Audioid + childItem.FileHash
        if (!ids.has(childKey)) {
          ids.add(childKey)
          items.push(childItem)
        }
      }
    })

    const hashList = items.map((item) => item.FileHash)

    let qualityInfoMap = {}
    try {
      const qualityInfoRequest = getBatchMusicQualityInfo(hashList)
      qualityInfoMap = await qualityInfoRequest.promise
    } catch (error) {
      console.error('Failed to fetch quality info:', error)
    }

    return items.map((item) => {
      const { types = [], _types = {} } = qualityInfoMap[item.FileHash] || {}

      return {
        singer: decodeName(formatSingerName(item.Singers, 'name')),
        name: decodeName(item.SongName),
        albumName: decodeName(item.AlbumName),
        albumId: item.AlbumID,
        songmid: item.Audioid,
        source: 'kg',
        interval: formatPlayTime(item.Duration),
        _interval: item.Duration,
        img: null,
        lrc: null,
        otherSource: null,
        hash: item.FileHash,
        types,
        _types,
        typeUrl: {}
      }
    })
  },
  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit

    return this.musicSearch(str, page, limit).then(async (result) => {
      if (!result || result.error_code !== 0) return this.search(str, page, limit, retryNum)

      let list = await this.handleResult(result.data.lists)

      if (list == null) return this.search(str, page, limit, retryNum)

      this.total = result.data.total
      this.page = page
      this.allPage = Math.ceil(this.total / limit)

      return Promise.resolve({
        list,
        allPage: this.allPage,
        limit,
        total: this.total,
        source: 'kg'
      })
    })
  }
}
