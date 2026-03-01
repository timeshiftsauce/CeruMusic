import leaderboard from './leaderboard'
import getLyric from './lyric'
import getMusicInfo from './musicInfo'
import musicSearch from './musicSearch'
import songList from './songList'
import hotSearch from './hotSearch'
import comment from './comment'
import tipSearch from './tipSearch'
import recognize from './recognize'
import singer from './singer'

const wy = {
  tipSearch,
  leaderboard,
  musicSearch,
  songList,
  hotSearch,
  comment,
  recognize,
  singer,
  getLyric(songInfo) {
    return getLyric(songInfo.songmid)
  },
  getPic(songInfo) {
    const requestObj = getMusicInfo(songInfo.songmid)
    return requestObj.promise.then((info) => info.al.picUrl)
  },
  getMusicDetailPageUrl(songInfo) {
    return `https://music.163.com/#/song?id=${songInfo.songmid}`
  }
}

export default wy
