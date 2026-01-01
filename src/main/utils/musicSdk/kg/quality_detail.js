import { httpFetch } from '../../request'
import { dnsLookup } from '../utils'
import { headers, timeout } from '../options'
import { sizeFormate, decodeName, formatPlayTime } from '../../index'
import { formatSingerName } from '../utils'

export const getBatchMusicQualityInfo = (hashList) => {
  const resources = hashList.map((hash) => ({
    id: 0,
    type: 'audio',
    hash,
  }))

  const requestObj = httpFetch(
    `https://gateway.kugou.com/goodsmstore/v1/get_res_privilege?appid=1005&clientver=20049&clienttime=${Date.now()}&mid=NeZha`,
    {
      method: 'post',
      timeout,
      headers,
      body: {
        behavior: 'play',
        clientver: '20049',
        resource: resources,
        area_code: '1',
        quality: '128',
        qualities: [
          '128',
          '320',
          'flac',
          'high',
          'dolby',
          'viper_atmos',
          'viper_tape',
          'viper_clear',
        ],
      },
      lookup: dnsLookup,
      family: 4,
    }
  )

  const qualityInfoMap = {}

  requestObj.promise = requestObj.promise.then(({ statusCode, body }) => {
    if (statusCode != 200 || body.error_code != 0)
      return Promise.reject(new Error('获取音质信息失败'))

    body.data.forEach((songData, index) => {
      const hash = hashList[index]
      const types = []
      const _types = {}

      if (!songData || !songData.relate_goods) return

      for (const quality_data of songData.relate_goods) {
        if (quality_data.quality === '128') {
          let size = sizeFormate(quality_data.info.filesize)
          types.push({ type: '128k', size, hash: quality_data.hash })
          _types['128k'] = {
            size,
            hash: quality_data.hash,
          }
        }
        if (quality_data.quality === '320') {
          let size = sizeFormate(quality_data.info.filesize)
          types.push({ type: '320k', size, hash: quality_data.hash })
          _types['320k'] = {
            size,
            hash: quality_data.hash,
          }
        }
        if (quality_data.quality === 'flac') {
          let size = sizeFormate(quality_data.info.filesize)
          types.push({ type: 'flac', size, hash: quality_data.hash })
          _types.flac = {
            size,
            hash: quality_data.hash,
          }
        }
        if (quality_data.quality === 'high') {
          let size = sizeFormate(quality_data.info.filesize)
          types.push({ type: 'hires', size, hash: quality_data.hash })
          _types.hires = {
            size,
            hash: quality_data.hash,
          }
        }
        if (quality_data.quality === 'viper_clear') {
          let size = sizeFormate(quality_data.info.filesize)
          types.push({ type: 'master', size, hash: quality_data.hash })
          _types.master = {
            size,
            hash: quality_data.hash,
          }
        }
        if (quality_data.quality === 'viper_atmos') {
          let size = sizeFormate(quality_data.info.filesize)
          types.push({ type: 'atmos', size, hash: quality_data.hash })
          _types.atmos = {
            size,
            hash: quality_data.hash,
          }
        }
      }

      qualityInfoMap[hash] = { types, _types }
    })

    return qualityInfoMap
  })

  return requestObj
}

export const getHashFromItem = (item) => {
  if (item.hash) return item.hash
  if (item.FileHash) return item.FileHash
  if (item.audio_info && item.audio_info.hash) return item.audio_info.hash
  return null
}

export const filterData = async (rawList, options = {}) => {
  let processedList = rawList

  if (options.removeDuplicates) {
    let ids = new Set()
    processedList = rawList.filter((item) => {
      if (!item) return false
      const audioId = item.audio_info?.audio_id || item.audio_id
      if (ids.has(audioId)) return false
      ids.add(audioId)
      return true
    })
  }

  const hashList = processedList.map((item) => getHashFromItem(item)).filter((hash) => hash)

  const qualityInfoRequest = getBatchMusicQualityInfo(hashList)
  let qualityInfoMap = {}

  try {
    qualityInfoMap = await qualityInfoRequest.promise
  } catch (error) {
    console.error('Failed to fetch quality info:', error)
  }

  return processedList.map((item) => {
    const hash = getHashFromItem(item)
    const { types = [], _types = {} } = qualityInfoMap[hash] || {}

    if (item.audio_info) {
      return {
        name: decodeName(item.songname),
        singer: decodeName(item.author_name),
        albumName: decodeName(item.album_info?.album_name || item.remark),
        albumId: item.album_info.album_id,
        songmid: item.audio_info.audio_id,
        source: 'kg',
        interval: options.fix
          ? formatPlayTime(parseInt(item.audio_info.timelength) / 1000)
          : formatPlayTime(parseInt(item.audio_info.timelength)),
        img: null,
        lrc: null,
        hash: item.audio_info.hash,
        otherSource: null,
        types,
        _types,
        typeUrl: {},
      }
    }

    return {
      name: decodeName(item.songname),
      singer: decodeName(item.singername) || formatSingerName(item.authors, 'author_name'),
      albumName: decodeName(item.album_name || item.remark),
      albumId: item.album_id,
      songmid: item.audio_id,
      source: 'kg',
      interval: options.fix ? formatPlayTime(item.duration / 1000) : formatPlayTime(item.duration),
      img: null,
      lrc: null,
      hash: item.hash,
      types,
      _types,
      typeUrl: {},
    }
  })
}
