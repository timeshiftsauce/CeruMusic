import { createHttpFetch } from './util'

export default {
  requestObj: null,
  cancelTipSearch() {
    if (this.requestObj && this.requestObj.cancelHttp) this.requestObj.cancelHttp()
  },
  tipSearchBySong(str) {
    this.cancelTipSearch()
    this.requestObj = createHttpFetch(
      `https://searchtip.kugou.com/getSearchTip?MusicTipCount=10&keyword=${encodeURIComponent(str)}`,
      {
        headers: {
          referer: 'https://www.kugou.com/'
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
      albums: []
    }
    if (rawData[0].RecordCount > 0) {
      list.order.push('songs')
    }
    if (rawData[2].RecordCount > 0) {
      list.order.push('albums')
    }
    list.songs = rawData[0].RecordDatas.map((info) => ({
      name: info.HintInfo
    }))
    list.albums = rawData[2].RecordDatas.map((info) => ({
      name: info.HintInfo
    }))
    return list
  },
  async search(str) {
    return this.tipSearchBySong(str).then((result) => this.handleResult(result))
  }
}
