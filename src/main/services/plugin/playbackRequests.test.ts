//@ts-nocheck
import {
  applyPlaybackRequestHeaders,
  playbackRequestHeaders,
  registerPlaybackRequest
} from './playbackRequests'

describe('playback request headers', () => {
  it('keeps plugin headers scoped to the exact resolved URL', () => {
    const url = 'https://media.example/audio.m4s?token=one'
    registerPlaybackRequest(url, {
      Referer: 'https://player.example/',
      'User-Agent': 'Ceru fixture'
    })

    expect(playbackRequestHeaders(url)).toEqual({
      Referer: 'https://player.example/',
      'User-Agent': 'Ceru fixture'
    })
    expect(playbackRequestHeaders('https://media.example/audio.m4s?token=two')).toEqual({})
    expect(
      applyPlaybackRequestHeaders(url, { Range: 'bytes=0-', referer: 'https://wrong.example/' })
    ).toEqual({
      Range: 'bytes=0-',
      Referer: 'https://player.example/',
      'User-Agent': 'Ceru fixture'
    })
  })

  it('rejects transport headers and newline injection', () => {
    expect(() =>
      registerPlaybackRequest('https://media.example/audio.m4s', { Host: 'other.example' })
    ).toThrow('播放请求头无效')
    expect(() =>
      registerPlaybackRequest('https://media.example/audio.m4s', {
        Referer: 'https://player.example/\r\nX-Test: unsafe'
      })
    ).toThrow('播放请求头无效')
  })
})
