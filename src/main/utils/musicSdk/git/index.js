import songList from './songList'
import musicSearch from './musicSearch'

const git = {
  songList,
  musicSearch,
  getMusicDetailPageUrl() {
    return ''
  },
  getMusicUrl(songInfo, _quality) {
    return songInfo._gitcodeData.download_url
  },
  getLyric(songInfo) {
    return {
      promise: Promise.resolve({
        lyric: songInfo._gitcodeData.lyrics
      })
    }
  }
}
export default git
