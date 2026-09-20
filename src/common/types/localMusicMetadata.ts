/** Values read from the audio file, never from a playlist's metadata cache. */
export interface LocalMusicTags {
  name: string
  singer: string
  albumName: string
  year: number
  genre: string
  hasCover: boolean
  lrc: string
}
export interface LocalMusicTagsChanged {
  oldSongmid: string
  song: {
    songmid: string
    source: 'local'
    path: string
    name: string
    singer: string
    albumName: string
    year: number
    lrc: string
    img: string
    hasCover: boolean
    coverKey: string
  }
}
