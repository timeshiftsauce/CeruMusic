import kw from './kw/index'
import bd from './bd/index'
import kg from './kg/index'
import tx from './tx/index'
import wy from './wy/index'
import mg from './mg/index'
import git from './git/index'

// 导入工具函数
export {
  decodeName,
  formatPlayTime,
  sizeFormate,
  dateFormat,
  formatPlayCount,
  dateFormat2
} from '../utils'

const sources = {
  sources: [
    {
      name: '酷我音乐',
      id: 'kw'
    },
    {
      name: '波点音乐',
      id: 'bd'
    },
    {
      name: '酷狗音乐',
      id: 'kg'
    },
    {
      name: 'QQ音乐',
      id: 'tx'
    },
    {
      name: '网易音乐',
      id: 'wy'
    },
    {
      name: '咪咕音乐',
      id: 'mg'
    },
    {
      name: '虾米音乐',
      id: 'xm'
    },
    {
      name: 'Git音乐',
      id: 'git'
    }
  ],
  kw,
  bd,
  kg,
  tx,
  wy,
  mg,
  git
}
// 聚合源参与的源 id 顺序,决定交错合并的轮转顺序
const AGGREGATE_ORDER = ['wy', 'kg', 'tx', 'kw', 'mg', 'git']

const interleave = (arrays) => {
  const result = []
  const lists = arrays.filter((a) => Array.isArray(a) && a.length)
  if (!lists.length) return result
  const max = Math.max(...lists.map((a) => a.length))
  for (let i = 0; i < max; i++) {
    for (const arr of lists) if (i < arr.length) result.push(arr[i])
  }
  return result
}

const settle = async (promises) => {
  const results = await Promise.allSettled(promises)
  return results.map((r) => (r.status === 'fulfilled' ? r.value : null))
}

const ensureSource = (item, source) => {
  if (item && !item.source) item.source = source
  return item
}

const aggregate = {
  async search(keyword, page = 1, limit = 30) {
    const tasks = AGGREGATE_ORDER.filter(
      (id) => sources[id] && sources[id].musicSearch && sources[id].musicSearch.search
    ).map((id) =>
      sources[id].musicSearch.search(keyword, page, limit).catch(() => null)
    )
    const results = await Promise.all(tasks)
    const validResults = results.filter((r) => r && Array.isArray(r.list))
    const lists = validResults.map((res) =>
      (res.list || []).map((item) => ensureSource(item, res.source))
    )
    const merged = interleave(lists)
    const total = validResults.reduce((sum, r) => sum + (r.total || 0), 0)
    return {
      list: merged,
      allPage: Math.max(1, ...validResults.map((r) => r.allPage || 1)),
      limit,
      total,
      source: 'all'
    }
  },

  async searchPlaylist(keyword, page = 1, limit = 30) {
    const tasks = AGGREGATE_ORDER.filter(
      (id) => sources[id] && sources[id].songList && sources[id].songList.search
    ).map((id) =>
      Promise.resolve(sources[id].songList.search(keyword, page, limit)).catch(() => null)
    )
    const results = await Promise.all(tasks)
    const valid = results.filter((r) => r && Array.isArray(r.list))
    const lists = valid.map((res) =>
      res.list.map((item) => ensureSource(item, res.source))
    )
    return {
      list: interleave(lists),
      total: valid.reduce((sum, r) => sum + (r.total || 0), 0),
      page,
      source: 'all'
    }
  },

  async getPlaylistTags() {
    const ids = AGGREGATE_ORDER.filter(
      (id) => sources[id] && sources[id].songList && sources[id].songList.getTags
    )
    const results = await settle(ids.map((id) => sources[id].songList.getTags()))
    const sourceNameMap = Object.fromEntries(sources.sources.map((s) => [s.id, s.name]))
    const hotTag = []
    const tags = []
    ids.forEach((id, idx) => {
      const res = results[idx]
      if (!res) return
      const platName = sourceNameMap[id] || id
      ;(res.hotTag || []).slice(0, 4).forEach((t) => {
        hotTag.push({ ...t, id: `${id}__${t.id}`, _source: id })
      })
      const groupList = []
      if (Array.isArray(res.tags)) {
        res.tags.forEach((g) => {
          ;(g.list || []).forEach((t) => {
            groupList.push({ ...t, id: `${id}__${t.id}`, _source: id, _group: g.name })
          })
        })
      }
      if (groupList.length) tags.push({ name: platName, list: groupList })
    })
    return { hotTag, tags, source: 'all' }
  },

  async getCategoryPlaylists({ sortId, tagId = '', page = 1, limit }) {
    // tagId 形如 'wy__123' 表示指定单一源;空表示热门
    if (tagId && tagId.includes('__')) {
      const [sid, realTagId] = tagId.split('__')
      const sm = sources[sid]
      if (!sm || !sm.songList) return { list: [], total: 0, page, source: 'all' }
      const realSort = sortId || (sm.songList.sortList && sm.songList.sortList[0]?.id) || ''
      const realLimit = limit || sm.songList.limit_list
      const res =
        sid === 'wy'
          ? await sm.songList.getList(realSort, realTagId, page, realLimit).catch(() => null)
          : await Promise.resolve(sm.songList.getList(realSort, realTagId, page)).catch(() => null)
      if (!res) return { list: [], total: 0, page, source: 'all' }
      return {
        list: (res.list || []).map((item) => ensureSource(item, sid)),
        total: res.total || 0,
        page,
        source: 'all'
      }
    }
    // 热门:各源并发取热门并交错
    const ids = AGGREGATE_ORDER.filter(
      (id) =>
        sources[id] &&
        sources[id].songList &&
        sources[id].songList.getList &&
        sources[id].songList.sortList
    )
    const tasks = ids.map((id) => {
      const sm = sources[id].songList
      const realSort = sm.sortList[0]?.id
      const realLimit = limit || sm.limit_list
      return id === 'wy'
        ? Promise.resolve(sm.getList(realSort, '', page, realLimit)).catch(() => null)
        : Promise.resolve(sm.getList(realSort, '', page)).catch(() => null)
    })
    const results = await Promise.all(tasks)
    const valid = []
    results.forEach((r, i) => {
      if (r && Array.isArray(r.list)) {
        valid.push({
          list: r.list.map((item) => ensureSource(item, ids[i])),
          total: r.total || 0
        })
      }
    })
    return {
      list: interleave(valid.map((r) => r.list)),
      total: valid.reduce((sum, r) => sum + r.total, 0),
      page,
      source: 'all'
    }
  },

  async getLeaderboards() {
    const ids = AGGREGATE_ORDER.filter(
      (id) => sources[id] && sources[id].leaderboard && sources[id].leaderboard.getBoards
    )
    const results = await settle(ids.map((id) => sources[id].leaderboard.getBoards()))
    const merged = []
    ids.forEach((id, idx) => {
      const res = results[idx]
      if (!res) return
      const list = Array.isArray(res) ? res : res.list
      if (!Array.isArray(list)) return
      list.forEach((b) => merged.push(ensureSource({ ...b }, id)))
    })
    return merged
  },

  async tipSearch(keyword) {
    const ids = AGGREGATE_ORDER.filter(
      (id) => sources[id] && sources[id].tipSearch && sources[id].tipSearch.search
    )
    const results = await settle(ids.map((id) => sources[id].tipSearch.search(keyword)))
    const merged = { order: [], songs: [], artists: [], albums: [], playlists: [] }
    const keys = ['songs', 'artists', 'albums', 'playlists']
    const buckets = { songs: [], artists: [], albums: [], playlists: [] }
    ids.forEach((id, idx) => {
      const res = results[idx]
      if (!res || typeof res !== 'object') return
      keys.forEach((k) => {
        const arr = Array.isArray(res[k]) ? res[k] : []
        if (!arr.length) return
        buckets[k].push(arr.map((item) => ({ ...item, source: id })))
      })
    })
    keys.forEach((k) => {
      const flat = interleave(buckets[k])
      // 按 name 去重
      const seen = new Set()
      const dedup = []
      for (const item of flat) {
        const key = String(item?.name || '').toLowerCase().trim()
        if (key && !seen.has(key)) {
          seen.add(key)
          dedup.push(item)
        }
      }
      merged[k] = dedup.slice(0, 12)
      if (dedup.length) merged.order.push(k)
    })
    return merged
  }
}

export default {
  ...sources,
  aggregate,
  init() {
    const tasks = []
    for (const source of sources.sources) {
      const sm = sources[source.id]
      sm && sm.init && tasks.push(sm.init())
    }
    return Promise.all(tasks)
  },
  async searchMusic({ name, singer, source: s, limit = 25 }) {
    const trimStr = (str) => (typeof str === 'string' ? str.trim() : str)
    const musicName = trimStr(name)
    const tasks = []
    const excludeSource = ['xm']
    for (const source of sources.sources) {
      if (!sources[source.id].musicSearch || source.id == s || excludeSource.includes(source.id))
        continue
      tasks.push(
        sources[source.id].musicSearch
          .search(`${musicName} ${singer || ''}`.trim(), 1, limit)
          .catch((_) => null)
      )
    }
    return (await Promise.all(tasks)).filter((s) => s)
  },

  async findMusic({ name, singer, albumName, interval, source: s }) {
    const lists = await this.searchMusic({ name, singer, source: s, limit: 25 })
    // console.log(lists)
    // console.log({ name, singer, albumName, interval, source: s })

    const singersRxp = /、|&|;|；|\/|,|，|\|/
    const sortSingle = (singer) =>
      singersRxp.test(singer)
        ? singer
            .split(singersRxp)
            .sort((a, b) => a.localeCompare(b))
            .join('、')
        : singer || ''
    const sortMusic = (arr, callback) => {
      const tempResult = []
      for (let i = arr.length - 1; i > -1; i--) {
        const item = arr[i]
        if (callback(item)) {
          delete item.fSinger
          delete item.fMusicName
          delete item.fAlbumName
          delete item.fInterval
          tempResult.push(item)
          arr.splice(i, 1)
        }
      }
      tempResult.reverse()
      return tempResult
    }
    const getIntv = (interval) => {
      if (!interval) return 0
      // if (musicInfo._interval) return musicInfo._interval
      const intvArr = interval.split(':')
      let intv = 0
      let unit = 1
      while (intvArr.length) {
        intv += parseInt(intvArr.pop()) * unit
        unit *= 60
      }
      return intv
    }
    const trimStr = (str) => (typeof str === 'string' ? str.trim() : str || '')
    const filterStr = (str) =>
      typeof str === 'string'
        ? str.replace(/\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！/g, '')
        : String(str || '')
    const fMusicName = filterStr(name).toLowerCase()
    const fSinger = filterStr(sortSingle(singer)).toLowerCase()
    const fAlbumName = filterStr(albumName).toLowerCase()
    const fInterval = getIntv(interval)
    const isEqualsInterval = (intv) => Math.abs((fInterval || intv) - (intv || fInterval)) < 5
    const isIncludesName = (name) => fMusicName.includes(name) || name.includes(fMusicName)
    const isIncludesSinger = (singer) =>
      fSinger ? fSinger.includes(singer) || singer.includes(fSinger) : true
    const isEqualsAlbum = (album) => (fAlbumName ? fAlbumName == album : true)

    const result = lists
      .map((source) => {
        for (const item of source.list) {
          item.name = trimStr(item.name)
          item.singer = trimStr(item.singer)
          item.fSinger = filterStr(sortSingle(item.singer).toLowerCase())
          item.fMusicName = filterStr(String(item.name ?? '').toLowerCase())
          item.fAlbumName = filterStr(String(item.albumName ?? '').toLowerCase())
          item.fInterval = getIntv(item.interval)
          // console.log(fMusicName, item.fMusicName, item.source)
          if (!isEqualsInterval(item.fInterval)) {
            item.name = null
            continue
          }
          if (item.fMusicName == fMusicName && isIncludesSinger(item.fSinger)) return item
        }
        for (const item of source.list) {
          if (item.name == null) continue
          if (item.fSinger == fSinger && isIncludesName(item.fMusicName)) return item
        }
        for (const item of source.list) {
          if (item.name == null) continue
          if (
            isEqualsAlbum(item.fAlbumName) &&
            isIncludesSinger(item.fSinger) &&
            isIncludesName(item.fMusicName)
          )
            return item
        }
        return null
      })
      .filter((s) => s)
    const newResult = []
    if (result.length) {
      newResult.push(
        ...sortMusic(
          result,
          (item) =>
            item.fSinger == fSinger && item.fMusicName == fMusicName && item.interval == interval
        )
      )
      newResult.push(
        ...sortMusic(
          result,
          (item) =>
            item.fMusicName == fMusicName &&
            item.fSinger == fSinger &&
            item.fAlbumName == fAlbumName
        )
      )
      newResult.push(
        ...sortMusic(result, (item) => item.fSinger == fSinger && item.fMusicName == fMusicName)
      )
      newResult.push(
        ...sortMusic(result, (item) => item.fMusicName == fMusicName && item.interval == interval)
      )
      newResult.push(
        ...sortMusic(result, (item) => item.fSinger == fSinger && item.interval == interval)
      )
      newResult.push(...sortMusic(result, (item) => item.interval == interval))
      newResult.push(...sortMusic(result, (item) => item.fMusicName == fMusicName))
      newResult.push(...sortMusic(result, (item) => item.fSinger == fSinger))
      newResult.push(...sortMusic(result, (item) => item.fAlbumName == fAlbumName))
      for (const item of result) {
        delete item.fSinger
        delete item.fMusicName
        delete item.fAlbumName
        delete item.fInterval
      }
      newResult.push(...result)
    }
    // console.log(newResult)
    return newResult
  }
}
