import axios, { AxiosInstance } from 'axios'

const timeout: number = 5000

const mobileHeaders = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148'
}

const axiosClient: AxiosInstance = axios.create({
  timeout: timeout
})

interface MusicServiceBase {
  search({
    type,
    keyword,
    offset,
    limit
  }: {
    type: number
    keyword: string
    offset?: number
    limit: number
  }): Promise<any>
  getSongDetail({ ids }: { ids: string[] }): Promise<any>
  getSongUrl({ id }: { id: string }): Promise<any>
  getLyric({
    id,
    lv,
    yv,
    tv
  }: {
    id: string
    lv?: boolean
    yv?: boolean
    tv?: boolean
  }): Promise<any>
}

export type { MusicServiceBase }
export { mobileHeaders, axiosClient }
