import { expect, test } from '@jest/globals'
import { playlistSectionProps } from './pluginPlaylistContext'
import type { PluginDescriptor } from './pluginDescriptor'

const descriptor = {
  runtime: 3,
  pages: [{ id: 'section', view: 'summary', mount: 'playlist-section' }]
} as PluginDescriptor
const context = {
  pageId: 'section',
  playlist: {
    ref: { id: 'private-id', location: 'cloud' as const },
    name: 'Cloud',
    writable: true,
    trackCount: 7,
    token: 'hidden',
    songs: []
  }
}
test('only the declared v3 section gets the public playlist fields', () => {
  expect(playlistSectionProps(descriptor, 'summary', context)).toEqual({
    playlist: {
      ref: { id: 'private-id', location: 'cloud' },
      name: 'Cloud',
      writable: true,
      trackCount: 7
    }
  })
  expect(() => playlistSectionProps(descriptor, 'another', context)).toThrow()
  expect(() => playlistSectionProps({ ...descriptor, runtime: 2 }, 'summary', context)).toThrow()
  expect(() =>
    playlistSectionProps(descriptor, 'summary', {
      ...context,
      playlist: { ...context.playlist, ref: { id: 'C:/secret', location: 'local' } }
    })
  ).toThrow()
})
