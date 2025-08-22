import leaderboard from './leaderboard'
import lyric from './lyric'
import songList from './songList'
import musicSearch from './musicSearch'
import hotSearch from './hotSearch'
import comment from './comment'
// import tipSearch from './tipSearch'

const tx = {
  // tipSearch,
  leaderboard,
  songList,
  musicSearch,
  hotSearch,
  comment,
  getLyric(songInfo) {
    // let singer = songInfo.singer.indexOf('、') > -1 ? songInfo.singer.split('、')[0] : songInfo.singer
    return lyric.getLyric(songInfo)
  },
  getMusicDetailPageUrl(songInfo) {
    return `https://y.qq.com/n/yqq/song/${songInfo.songmid}.html`
  }
}

export default tx
