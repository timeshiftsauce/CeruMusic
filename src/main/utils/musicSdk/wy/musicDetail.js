import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'
import { formatPlayTime } from '../../index'
import { getBatchMusicQualityInfo } from './quality_detail'

export default {
  getSinger(singers) {
    let arr = []
    singers?.forEach((singer) => {
      arr.push(singer.name)
    })
    return arr.join('、')
  },
  async filterList({ songs, privileges }) {
    const list = []
    const idList = songs.map((item) => item.id)
    const qualityInfoMap = await getBatchMusicQualityInfo(idList)

    songs.forEach((item, index) => {
      const { types, _types } = qualityInfoMap[item.id] || { types: [], _types: {} }

      if (item.pc) {
        list.push({
          singer: item.pc.ar ?? '',
          name: item.pc.sn ?? '',
          albumName: item.pc.alb ?? '',
          albumId: item.al?.id,
          source: 'wy',
          interval: formatPlayTime(item.dt / 1000),
          songmid: item.id,
          img: item.al?.picUrl ?? '',
          lrc: null,
          otherSource: null,
          types,
          _types,
          typeUrl: {},
        })
      } else {
        list.push({
          singer: this.getSinger(item.ar),
          name: item.name ?? '',
          albumName: item.al?.name,
          albumId: item.al?.id,
          source: 'wy',
          interval: formatPlayTime(item.dt / 1000),
          songmid: item.id,
          img: item.al?.picUrl,
          lrc: null,
          otherSource: null,
          types,
          _types,
          typeUrl: {},
        })
      }
    })
    return list
  },
  async getList(ids = [], retryNum = 0) {
    if (retryNum > 2) return Promise.reject(new Error('try max num'))

    const requestObj = httpFetch('https://music.163.com/weapi/v3/song/detail', {
      method: 'post',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
        origin: 'https://music.163.com',
      },
      form: weapi({
        c: '[' + ids.map((id) => '{"id":' + id + '}').join(',') + ']',
        ids: '[' + ids.join(',') + ']',
      }),
    })
    const { body, statusCode } = await requestObj.promise
    if (statusCode != 200 || body.code !== 200) throw new Error('获取歌曲详情失败')
    return { source: 'wy', list: await this.filterList(body) }
  },
}
