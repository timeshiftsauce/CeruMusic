export enum DownloadStatus {
  Queued = 'queued',
  Downloading = 'downloading',
  Paused = 'paused',
  Completed = 'completed',
  Error = 'error',
  Cancelled = 'cancelled'
}

export interface DownloadTask {
  id: string
  songInfo: any
  url: string
  pluginId?: string
  quality?: string
  filePath: string
  tagWriteOptions: any
  status: DownloadStatus
  progress: number // 0-100
  speed: number // bytes/s
  totalSize: number // bytes
  downloadedSize: number // bytes
  remainingTime: number | null // seconds
  retries: number
  error: string | null
  priority: number // 0 is highest
  createdAt: number
}
