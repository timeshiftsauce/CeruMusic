export default interface PlayList {
  songmid: string|number
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: string|number
  source: string
  interval: string
  img: string
  lrc: null | string
  types: string[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
}