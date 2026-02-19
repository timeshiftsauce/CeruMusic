import { httpFetch } from '../../request'
import { sizeFormate, formatPlayTime } from '../../index'
import { eapi } from './utils/crypto'

export default {
  limit: 30,
  total: 0,
  page: 0,
  allPage: 1,

  musicSearch(str, page, limit) {
    const searchRequest = httpFetch('http://interface3.music.163.com/eapi/search/song/list/page', {
      method: 'post',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
        origin: 'https://music.163.com',
      },
      form: eapi('/api/search/song/list/page', {
        keyword: str,
        needCorrect: '1',
        channel: 'typing',
        offset: limit * (page - 1),
        scene: 'normal',
        total: page == 1,
        limit: limit,
      }),
    })
    return searchRequest.promise.then(({ body }) => body)
  },

  getSinger(singers) {
    return singers.map((singer) => singer.name).join('、')
  },

  handleResult(rawList) {
    if (!rawList) return []

    return Promise.all(
      rawList.map(async (item) => {
        item = item.baseInfo.simpleSongData

        const types = []
        const _types = {}
        let size

        try {
          const requestObj = httpFetch(
            `https://music.163.com/api/song/music/detail/get?songId=${item.id}`,
            {
              method: 'get',
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
                origin: 'https://music.163.com',
              },
            }
          )

          const { body, statusCode } = await requestObj.promise

          if (statusCode !== 200 || !body || body.code !== 200) {
            throw new Error('Failed to get song quality information')
          }

          if (body.data.jm && body.data.jm.size) {
            size = sizeFormate(body.data.jm.size)
            types.push({ type: 'master', size })
            _types.master = { size }
          }
          if (body.data.db && body.data.db.size) {
            size = sizeFormate(body.data.db.size)
            types.push({ type: 'dolby', size })
            _types.dolby = { size }
          }
          if (body.data.hr && body.data.hr.size) {
            size = sizeFormate(body.data.hr.size)
            types.push({ type: 'hires', size })
            _types.hires = { size }
          }
          if (body.data.sq && body.data.sq.size) {
            size = sizeFormate(body.data.sq.size)
            types.push({ type: 'flac', size })
            _types.flac = { size }
          }
          if (body.data.h && body.data.h.size) {
            size = sizeFormate(body.data.h.size)
            types.push({ type: '320k', size })
            _types['320k'] = { size }
          }
          if (body.data.m && body.data.m.size) {
            size = sizeFormate(body.data.m.size)
            types.push({ type: '128k', size })
            _types['128k'] = { size }
          } else if (body.data.l && body.data.l.size) {
            size = sizeFormate(body.data.l.size)
            types.push({ type: '128k', size })
            _types['128k'] = { size }
          }

          types.reverse()

          return {
            singer: this.getSinger(item.ar),
            name: item.name,
            albumName: item.al.name,
            albumId: item.al.id,
            source: 'wy',
            interval: formatPlayTime(item.dt / 1000),
            songmid: item.id,
            img: item.al.picUrl,
            lrc: null,
            types,
            _types,
            typeUrl: {},
          }
        } catch (error) {
          console.error(error.message)
          return null
        }
      })
    )
  },

  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit
    return this.musicSearch(str, page, limit).then((result) => {
      if (!result || result.code !== 200) return this.search(str, page, limit, retryNum)
      return this.handleResult(result.data.resources || []).then((list) => {
        if (!list || list.length === 0) return this.search(str, page, limit, retryNum)

        this.total = result.data.totalCount || 0
        this.page = page
        this.allPage = Math.ceil(this.total / this.limit)

        return {
          list,
          allPage: this.allPage,
          limit: this.limit,
          total: this.total,
          source: 'wy',
        }
      })
    })
  },
}
