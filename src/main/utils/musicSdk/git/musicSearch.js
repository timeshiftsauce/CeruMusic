import { httpFetch } from '../../request'
import { getGitcodeUrl, formatMusicItem } from './config'

let cachedList = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

async function fetchAllMusic() {
  const now = Date.now()
  if (cachedList && now - cacheTime < CACHE_TTL) return cachedList

  const { body } = await httpFetch(getGitcodeUrl()).promise
  const list = (Array.isArray(body) ? body : []).map(formatMusicItem)
  cachedList = list
  cacheTime = now
  return list
}

export default {
  limit: 30,
  total: 0,
  page: 0,
  allPage: 1,
  musicSearch(str, page, limit) {
    return fetchAllMusic().then((list) => {
      const regex = new RegExp(
        str
          .split('')
          .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*'),
        'i'
      )
      const filtered = list.filter(
        (item) => regex.test(item.singer) || regex.test(item.name) || regex.test(item.albumName)
      )
      const start = (page - 1) * limit
      return {
        data: filtered.slice(start, start + limit),
        total: filtered.length
      }
    })
  },
  search(str, page = 1, limit, retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    if (limit == null) limit = this.limit

    return this.musicSearch(str, page, limit).then((result) => {
      if (!result) return this.search(str, page, limit, retryNum)

      this.total = result.total
      this.page = page
      this.allPage = Math.ceil(this.total / limit)

      return {
        list: result.data,
        allPage: this.allPage,
        limit,
        total: this.total,
        source: 'git'
      }
    })
  }
}
