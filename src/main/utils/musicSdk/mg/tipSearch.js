import { createHttpFetch } from './utils'

export default {
  requestObj: null,
  cancelTipSearch() {
    if (this.requestObj && this.requestObj.cancelHttp) this.requestObj.cancelHttp()
  },
  tipSearchBySong(str) {
    this.cancelTipSearch()
    this.requestObj = createHttpFetch(
      //https://app.u.nf.migu.cn/pc/resource/content/tone_search_suggest/v1.0?text=%E5%90%8E
      `https://app.u.nf.migu.cn/pc/resource/content/tone_search_suggest/v1.0?text=${encodeURIComponent(str)}`,
      {
        headers: {
          referer: 'https://music.migu.cn/v3'
        }
      }
    )
    return this.requestObj.then((body) => {
      return body
    })
  },
  handleResult(rawData) {
    let list = {
      order: [],
      songs: [],
      artists: []
    }
    if (rawData.songList.length > 0) {
      list.order.push('songs')
    }
    if (rawData.singerList.length > 0) {
      list.order.push('artists')
    }
    list.songs = rawData.songList.map((info) => ({
      name: info.songName
    }))
    list.artists = rawData.singerList.map((info) => ({
      name: info.singerName
    }))
    console.log(JSON.stringify(list))
    return list
  },
  async search(str) {
    return this.tipSearchBySong(str).then((result) => this.handleResult(result))
  }
}
