export interface QueuedDeepLink {
  sequence: number
  kind: 'song-share' | 'playlist-share' | 'listen-together' | 'plugin-file' | 'plugin-link' | 'public-link'
  value: string
}
