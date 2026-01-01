import { weapi } from './utils/crypto'
import { httpFetch } from '../../request'
import musicDetailApi from './musicDetail'
import { formatNumberToChineseSimple } from '@common/utils/common'



export default {
  limit: 100000,
  list: [
    {
      id: 'wybsb',
      name: '飙升榜',
      bangid: '19723756'
    },
    {
      id: 'wyrgb',
      name: '热歌榜',
      bangid: '3778678'
    },
    {
      id: 'wyxgb',
      name: '新歌榜',
      bangid: '3779629'
    },
    {
      id: 'wyycb',
      name: '原创榜',
      bangid: '2884035'
    },
    {
      id: 'wygdb',
      name: '古典榜',
      bangid: '71384707'
    },
    {
      id: 'wydouyb',
      name: '抖音榜',
      bangid: '2250011882'
    },
    {
      id: 'wyhyb',
      name: '韩语榜',
      bangid: '745956260'
    },
    {
      id: 'wydianyb',
      name: '电音榜',
      bangid: '1978921795'
    },
    {
      id: 'wydjb',
      name: '电竞榜',
      bangid: '2006508653'
    },
    {
      id: 'wyktvbb',
      name: 'KTV唛榜',
      bangid: '21845217'
    }
  ],
  getUrl(id) {
    return `https://music.163.com/discover/toplist?id=${id}`
  },
  regExps: {
    list: /<textarea id="song-list-pre-data" style="display:none;">(.+?)<\/textarea>/
  },
  _requestBoardsObj: null,
  getBoardsData() {
    if (this._requestBoardsObj) this._requestBoardsObj.cancelHttp()
    this._requestBoardsObj = httpFetch('https://music.163.com/weapi/toplist', {
      method: 'post',
      form: weapi({})
    })
    return this._requestBoardsObj.promise
  },
  getData(id) {
    const requestBoardsDetailObj = httpFetch('https://music.163.com/weapi/v3/playlist/detail', {
      method: 'post',
      form: weapi({
        id,
        n: 100000,
        p: 1
      })
    })
    return requestBoardsDetailObj.promise
  },

  filterBoardsData(rawList) {
    const list = []
    for (const board of rawList) {
      // 排除 MV榜
      // if (board.id == 201) continue
      list.push({
        id: 'wy__' + board.id,
        name: board.name,
        bangid: String(board.id),
        pic: board.coverImgUrl,
        listen: formatNumberToChineseSimple(board.playCount),
        update_frequency: board.updateFrequency,
        source: 'wy'
      })
    }
    return list
  },
  async getBoards(retryNum = 0) {
    if (++retryNum > 3) return Promise.reject(new Error('try max num'))
    let response
    try {
      response = await this.getBoardsData()
    } catch (error) {
      return this.getBoards(retryNum)
    }
    // console.log(response.body)
    if (response.statusCode !== 200 || response.body.code !== 200) return this.getBoards(retryNum)
    const list = this.filterBoardsData(response.body.list)
    // console.log(list)
    // console.log(JSON.stringify(list))
    this.list = list
    return {
      list,
      source: 'wy',
    }
  },
  async getList(bangid, page, retryNum = 0) {
    if (++retryNum > 6) return Promise.reject(new Error('try max num'))
    // console.log(bangid)
    let resp
    try {
      resp = await this.getData(bangid)
    } catch (err) {
      if (err.message == 'try max num') {
        throw err
      } else {
        return this.getList(bangid, page, retryNum)
      }
    }
    if (resp.statusCode !== 200 || resp.body.code !== 200)
      return this.getList(bangid, page, retryNum)
    // console.log(resp.body)
    let musicDetail
    try {
      musicDetail = await musicDetailApi.getList(
        resp.body.playlist.trackIds.map((trackId) => trackId.id)
      )
    } catch (err) {
      console.log(err)
      if (err.message == 'try max num') {
        throw err
      } else {
        return this.getList(bangid, page, retryNum)
      }
    }
    // console.log(musicDetail)
    return {
      total: musicDetail.list.length,
      list: musicDetail.list,
      limit: this.limit,
      page,
      source: 'wy'
    }
  },

  getDetailPageUrl(id) {
    if (typeof id === 'string') id = id.replace('wy__', '')
    return `https://music.163.com/#/discover/toplist?id=${id}`
  }
}
