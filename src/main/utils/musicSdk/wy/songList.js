import { weapi, linuxapi } from './utils/crypto'
import { httpFetch } from '../../request'
import { /* formatPlayTime, */ dateFormat, formatPlayCount } from '../../index'
import musicDetailApi from './musicDetail'
import { eapiRequest } from './utils/index'
// import { formatSingerName } from '../utils'

export default {
  _requestObj_tags: null,
  _requestObj_hotTags: null,
  _requestObj_list: null,
  limit_list: 30,
  limit_song: 100000,
  successCode: 200,
  cookie: 'MUSIC_U=',
  sortList: [
    {
      name: '最热',
      id: 'hot'
    }
  ],
  regExps: {
    listDetailLink: /^.+(?:\?|&)id=(\d+)(?:&.*$|#.*$|$)/,
    listDetailLink2: /^.+\/playlist\/(\d+)\/\d+\/.+$/
  },

  async handleParseId(link, retryNum = 0) {
    if (retryNum > 2) throw new Error('link try max num')

    const requestObj_listDetailLink = httpFetch(link)
    const {
      headers: { location },
      statusCode
    } = await requestObj_listDetailLink.promise
    if (statusCode > 400) return this.handleParseId(link, ++retryNum)
    const url = location == null ? link : location
    return this.regExps.listDetailLink.test(url)
      ? url.replace(this.regExps.listDetailLink, '$1')
      : url.replace(this.regExps.listDetailLink2, '$1')
  },

  async getListId(id) {
    let cookie
    if (/###/.test(id)) {
      const [url, token] = id.split('###')
      id = url
      cookie = `MUSIC_U=${token}`
    }
    if (/[?&:/]/.test(id)) {
      if (this.regExps.listDetailLink.test(id)) {
        id = id.replace(this.regExps.listDetailLink, '$1')
      } else if (this.regExps.listDetailLink2.test(id)) {
        id = id.replace(this.regExps.listDetailLink2, '$1')
      } else {
        id = await this.handleParseId(id)
      }
    }
    return { id, cookie }
  },
  async getListDetail(rawId, page, tryNum = 0) {
    if (tryNum > 1000) return Promise.reject(new Error('try max num'))

    const { id, cookie } = await this.getListId(rawId)
    if (cookie) this.cookie = cookie

    const requestObj_listDetail = httpFetch('https://music.163.com/api/linux/forward', {
      method: 'post',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
        Cookie: this.cookie
      },
      form: linuxapi({
        method: 'POST',
        url: 'https://music.163.com/api/v3/playlist/detail',
        params: {
          id,
          n: this.limit_song,
          s: 8
        }
      })
    })
    const { statusCode, body } = await requestObj_listDetail.promise
    if (statusCode !== 200 || body.code !== this.successCode)
      return this.getListDetail(id, page, ++tryNum)
    let limit = 50
    let rangeStart = (page - 1) * limit
    let list
    try {
      list = (
        await musicDetailApi.getList(
          body.playlist.trackIds.slice(rangeStart, limit * page).map((trackId) => trackId.id)
        )
      ).list
    } catch (err) {
      console.log(err)
      if (err.message == 'try max num') {
        throw err
      } else {
        return this.getListDetail(id, page, ++tryNum)
      }
    }
    return {
      list,
      page,
      limit,
      total: body.playlist.trackIds.length,
      source: 'wy',
      info: {
        play_count: formatPlayCount(body.playlist.playCount),
        name: body.playlist.name,
        img: body.playlist.coverImgUrl,
        desc: body.playlist.description,
        author: body.playlist.creator.nickname
      }
    }
  },

  // filterListDetail({ playlist: { tracks } }) {
  //   const list = []
  //   tracks.forEach((item) => {
  //     const types = []
  //     const _types = {}

  //     if (item.pc) {
  //       list.push({
  //         singer: item.pc.ar ?? '',
  //         name: item.pc.sn ?? '',
  //         albumName: item.pc.alb ?? '',
  //         albumId: item.al?.id,
  //         source: 'wy',
  //         interval: formatPlayTime(item.dt / 1000),
  //         songmid: item.id,
  //         img: item.al?.picUrl ?? '',
  //         lrc: null,
  //         otherSource: null,
  //         types,
  //         _types,
  //         typeUrl: {},
  //       })
  //     } else {
  //       list.push({
  //         singer: formatSingerName(item.ar, 'name'),
  //         name: item.name ?? '',
  //         albumName: item.al?.name,
  //         albumId: item.al?.id,
  //         source: 'wy',
  //         interval: formatPlayTime(item.dt / 1000),
  //         songmid: item.id,
  //         img: item.al?.picUrl,
  //         lrc: null,
  //         otherSource: null,
  //         types,
  //         _types,
  //         typeUrl: {},
  //       })
  //     }
  //   })
  //   return list
  // },

  getList(sortId, tagId, page, limit = this.limit_list, tryNum = 0) {
    if (tryNum > 2) return Promise.reject(new Error('try max num'))
    if (this._requestObj_list) this._requestObj_list.cancelHttp()
    this._requestObj_list = httpFetch('https://music.163.com/weapi/playlist/list', {
      method: 'post',
      form: weapi({
        cat: tagId || '全部',
        order: sortId,
        limit,
        offset: limit * (page - 1),
        total: true
      })
    })
    return this._requestObj_list.promise.then(({ body }) => {
      if (body.code !== this.successCode) return this.getList(sortId, tagId, page, ++tryNum)
      return {
        list: this.filterList(body.playlists),
        total: parseInt(body.total),
        page,
        limit,
        source: 'wy'
      }
    })
  },
  filterList(rawData) {
    return rawData.map((item) => ({
      play_count: formatPlayCount(item.playCount),
      id: String(item.id),
      author: item.creator.nickname,
      name: item.name,
      time: item.createTime ? dateFormat(item.createTime, 'Y-M-D') : '',
      img: item.coverImgUrl,
      grade: item.grade,
      total: item.trackCount,
      desc: item.description,
      source: 'wy'
    }))
  },

  getTag(tryNum = 0) {
    if (this._requestObj_tags) this._requestObj_tags.cancelHttp()
    if (tryNum > 2) return Promise.reject(new Error('try max num'))
    this._requestObj_tags = httpFetch('https://music.163.com/weapi/playlist/catalogue', {
      method: 'post',
      form: weapi({})
    })
    return this._requestObj_tags.promise.then(({ body }) => {
      if (body.code !== this.successCode) return this.getTag(++tryNum)
      return this.filterTagInfo(body)
    })
  },
  filterTagInfo({ sub, categories }) {
    const subList = {}
    for (const item of sub) {
      if (!subList[item.category]) subList[item.category] = []
      subList[item.category].push({
        parent_id: categories[item.category],
        parent_name: categories[item.category],
        id: item.name,
        name: item.name,
        source: 'wy'
      })
    }

    const list = []
    for (const key of Object.keys(categories)) {
      list.push({
        name: categories[key],
        list: subList[key],
        source: 'wy'
      })
    }
    return list
  },

  getHotTag(tryNum = 0) {
    if (this._requestObj_hotTags) this._requestObj_hotTags.cancelHttp()
    if (tryNum > 2) return Promise.reject(new Error('try max num'))
    this._requestObj_hotTags = httpFetch('https://music.163.com/weapi/playlist/hottags', {
      method: 'post',
      form: weapi({})
    })
    return this._requestObj_hotTags.promise.then(({ body }) => {
      if (body.code !== this.successCode) return this.getTag(++tryNum)
      return this.filterHotTagInfo(body.tags)
    })
  },
  filterHotTagInfo(rawList) {
    return rawList.map((item) => ({
      id: item.playlistTag.name,
      name: item.playlistTag.name,
      source: 'wy'
    }))
  },

  getTags() {
    return Promise.all([this.getTag(), this.getHotTag()]).then(([tags, hotTag]) => ({
      tags,
      hotTag,
      source: 'wy'
    }))
  },

  async getDetailPageUrl(rawId) {
    const { id } = await this.getListId(rawId)
    return `https://music.163.com/#/playlist?id=${id}`
  },

  search(text, page, limit = 20) {
    return eapiRequest('/api/cloudsearch/pc', {
      s: text,
      type: 1000,
      limit,
      total: page == 1,
      offset: limit * (page - 1)
    }).promise.then(({ body }) => {
      if (body.code != this.successCode) throw new Error('filed')
      return {
        list: this.filterList(body.result.playlists),
        limit,
        total: body.result.playlistCount,
        source: 'wy'
      }
    })
  }
}
