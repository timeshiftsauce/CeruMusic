//@ts-nocheck
import {
  applyPlaybackRequestHeaders,
  playbackRequestHeaders,
  registerPlaybackRequest
} from './playbackRequests'

describe('playback request headers', () => {
  it('omits the application referrer for images, retaining other request headers', () => {
    const url = 'https://images.example/cover.jpg'
    expect(
      applyPlaybackRequestHeaders(
        url,
        { Referer: 'http://localhost:5173/', Accept: 'image/*' },
        'image'
      )
    ).toEqual({ Accept: 'image/*' })
    expect(applyPlaybackRequestHeaders(url, { referer: 'https://app.example/' }, 'image')).toEqual(
      {}
    )
    expect(applyPlaybackRequestHeaders(url, { Referer: 'https://app.example/' }, 'xhr')).toEqual({
      Referer: 'https://app.example/'
    })
  })

  it('keeps explicit image headers scoped to the exact URL and leaves media headers unchanged', () => {
    const url = 'https://images.example/private-cover.jpg?token=one'
    registerPlaybackRequest(url, { Referer: 'https://provider.example/' })
    expect(
      applyPlaybackRequestHeaders(url, { Referer: 'http://localhost:5173/' }, 'image')
    ).toEqual({ Referer: 'https://provider.example/' })
    expect(
      applyPlaybackRequestHeaders(url + 'other', { Referer: 'http://localhost:5173/' }, 'image')
    ).toEqual({})
    expect(applyPlaybackRequestHeaders(url, { Range: 'bytes=0-' }, 'media')).toEqual({
      Range: 'bytes=0-',
      Referer: 'https://provider.example/'
    })
  })

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
