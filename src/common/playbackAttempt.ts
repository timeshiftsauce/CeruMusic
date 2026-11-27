export interface PlaybackTarget {
  source: string
  pluginId?: string
  quality?: string
}

export interface PlaybackAttemptResult extends PlaybackTarget {
  url?: string
  error?: string
  blockPlugin?: boolean
}

export class PlaybackProviderError extends Error {
  constructor(
    message: string,
    readonly blockPlugin: boolean
  ) {
    super(message)
  }
}
