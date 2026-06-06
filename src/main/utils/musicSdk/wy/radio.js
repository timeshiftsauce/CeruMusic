import { httpFetch } from '../../request'
import { formatPlayTime, sizeFormate, formatPlayCount } from '../../index'
import { eapiRequest } from './utils/index'
import { weapi } from './utils/crypto'

const WY_WEB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
  origin: 'https://music.163.com',
  referer: 'https://music.163.com/'
}

const pickImage = (...values) => values.find((value) => typeof value === 'string' && value.trim()) || ''

const pickPublishTime = (program = {}) =>
  [
    program.publishTime,
    program.pubTime,
    program.scheduledPublishTime,
    program.schedulePublishTime,
    program.createTime,
    program.auditTime,
    program.mainSong?.publishTime
  ].find((value) => Number(value) > 0) || 0

const formatPublishDate = (value) => {
  const rawTimestamp = Number(value)
  if (!rawTimestamp) return ''
  const timestamp = rawTimestamp < 1000000000000 ? rawTimestamp * 1000 : rawTimestamp
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const buildTypes = (song = {}) => {
  const types = []
  const _types = {}
  const append = (type, file) => {
    if (!file) return
    const size = file.size ? sizeFormate(file.size) : undefined
    types.push({ type, size })
    _types[type] = { size }
  }

  append('flac', song.sq)
  append('320k', song.h)
  append('128k', song.m || song.l)

  if (!types.length) {
    types.push({ type: '128k' })
    _types['128k'] = {}
  }

  return { types: types.reverse(), _types }
}

const mapRadio = (item) => ({
  id: String(item.id),
  name: item.name || '',
  desc: item.desc || item.rcmdText || '',
  img: pickImage(item.picUrl, item.picUrlStr, item.coverUrl),
  author: item.dj?.nickname || item.dj?.userName || '',
  total: item.programCount || 0,
  play_count: formatPlayCount(item.playCount || item.subCount || 0),
  source: 'wy'
})

const mapProgram = (program, radioFallback = {}) => {
  const mainSong = program.mainSong || {}
  const radio = program.radio || radioFallback || {}
  const { types, _types } = buildTypes(mainSong)
  const duration = program.duration || mainSong.duration || mainSong.dt || 0
  const publishTime = pickPublishTime(program)

  return {
    singer: radio.name || program.dj?.nickname || radio.dj?.nickname || '',
    name: program.name || mainSong.name || '',
    albumName: radio.name || '电台节目',
    albumId: radio.id || radioFallback.id || '',
    source: 'wy',
    interval: formatPlayTime(duration / 1000),
    songmid: mainSong.id || program.mainTrackId || program.mainSongId || program.id,
    img: pickImage(program.coverUrl, radio.picUrl, radio.picUrlStr, mainSong.al?.picUrl),
    lrc: null,
    otherSource: null,
    types,
    _types,
    typeUrl: {},
    contentType: 'radio-program',
    programId: program.id,
    radioId: radio.id || radioFallback.id || '',
    publishTime,
    publishDate: formatPublishDate(publishTime)
  }
}

const readSearchResult = (body = {}) => {
  const result = body.result || body.data?.result || body['/api/cloudsearch/pc']?.result || {}
  const radios = result.djRadios || result.djRadiosResult?.djRadios || result.resources || []
  const total = result.djRadiosCount || result.djRadiosResult?.djRadiosCount || result.totalCount || 0
  return { radios, total }
}

const buildSearchResult = ({ body }, page, limit) => {
  if (!body || body.code !== 200) throw new Error(body?.message || '电台搜索失败')
  const { radios, total } = readSearchResult(body)
  return {
    list: radios.map((item) => mapRadio(item.baseInfo || item.djRadio || item)),
    total,
    page,
    limit,
    source: 'wy'
  }
}

const createSearchParams = (keyword, page, limit) => ({
  s: keyword,
  type: 1009,
  limit,
  total: page === 1,
  offset: limit * (page - 1)
})

const requestSearchByEapi = (params) => eapiRequest('/api/cloudsearch/pc', params).promise

const requestSearchByWeapi = (params) =>
  httpFetch('https://music.163.com/weapi/cloudsearch/get/web?csrf_token=', {
    method: 'post',
    headers: WY_WEB_HEADERS,
    form: weapi(params)
  }).promise

const requestSearchByWebApi = (params) =>
  httpFetch('https://music.163.com/api/search/get/web', {
    method: 'post',
    headers: WY_WEB_HEADERS,
    form: params
  }).promise

const searchByFallbacks = async (keyword, page, limit) => {
  const params = createSearchParams(keyword, page, limit)
  const requesters = [requestSearchByEapi, requestSearchByWeapi, requestSearchByWebApi]
  let lastError
  let firstEmptyResult

  for (const requester of requesters) {
    try {
      const result = buildSearchResult(await requester(params), page, limit)
      if (result.list.length || result.total > 0) return result
      firstEmptyResult ||= result
    } catch (error) {
      lastError = error
    }
  }

  if (firstEmptyResult) return firstEmptyResult
  throw lastError || new Error('电台搜索失败')
}

export default {
  limit: 20,
  successCode: 200,

  search(keyword, page = 1, limit = this.limit) {
    return searchByFallbacks(keyword, page, limit)
  },

  getPrograms({ radioId, page = 1, limit = 30, asc = false, radio } = {}) {
    if (!radioId) return Promise.resolve({ list: [], total: 0, page, limit, source: 'wy' })
    const offset = limit * (page - 1)
    const requestObj = httpFetch(
      `https://music.163.com/api/dj/program/byradio?radioId=${radioId}&limit=${limit}&offset=${offset}&asc=${asc ? 'true' : 'false'}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
          referer: 'https://music.163.com/'
        }
      }
    )

    return requestObj.promise.then(({ body }) => {
      if (body.code !== this.successCode) throw new Error('获取电台节目失败')
      const programs = body.programs || []
      return {
        list: programs.filter((item) => item.mainSong || item.mainTrackId).map((item) => mapProgram(item, radio)),
        total: body.count || programs.length,
        page,
        limit,
        source: 'wy'
      }
    })
  }
}