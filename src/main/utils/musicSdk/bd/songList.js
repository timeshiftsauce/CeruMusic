import axios from 'axios'
import { formatPlayTime } from '../../index'

export default {
  getReqId() {
    function t() {
      return (65536 * (1 + Math.random()) | 0).toString(16).substring(1)
    }
    return t() + t() + t() + t() + t() + t() + t() + t()
  },
  filterBDListDetail(rawList) {
    return rawList.map((item) => {
      let types = []
      let _types = {}
      for (let info of item.audios) {
        info.size = info.size?.toLocaleUpperCase()
        switch (info.bitrate) {
          case '4000':
            types.push({ type: 'flac24bit', size: info.size })
            _types.flac24bit = {
              size: info.size
            }
            break
          case '2000':
            types.push({ type: 'flac', size: info.size })
            _types.flac = {
              size: info.size
            }
            break
          case '320':
            types.push({ type: '320k', size: info.size })
            _types['320k'] = {
              size: info.size
            }
            break
          case '128':
            types.push({ type: '128k', size: info.size })
            _types['128k'] = {
              size: info.size
            }
            break
        }
      }
      types.reverse()

      return {
        singer: item.artists.map((s) => s.name).join('、'),
        name: item.name,
        albumName: item.album,
        albumId: item.albumId,
        songmid: item.id,
        source: 'kw',
        interval: formatPlayTime(item.duration),
        img: item.albumPic,
        releaseDate: item.releaseDate,
        lrc: null,
        otherSource: null,
        types,
        _types,
        typeUrl: {}
      }
    })
  },
  // 获取歌曲列表内的音乐
  async getListDetail(id, page, retryNum = 0) {
    const config = {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
        "plat": "h5"
      }
    }

    const { data: infoRes } = await axios.get(`https://bd-api.kuwo.cn/api/service/playlist/info/${id}?reqId=${this.getReqId()}&source=5`, config)

    const { data: listRes } = await axios.get(`https://bd-api.kuwo.cn/api/service/playlist/${id}/musicList?reqId=${this.getReqId()}&source=5&pn=${page}&rn=100`, config)

    if(infoRes.code !== 200 || listRes.code !== 200) {
      // 获取失败
      return
    }

    const info = {
      name: infoRes.data.name,
      img: infoRes.data.pic,
      desc: infoRes.data.description,
      meta: {
        playlistId: id
      }
    }
    const list = this.filterBDListDetail(listRes.data.list)

    return {
      list,
      page: listRes.data.pageNum,
      limit: 100,
      total: listRes.data.total,
      source: "kw",
      info
    }
  }
}
