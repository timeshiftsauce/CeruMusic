import type { MusicItem } from '@common/musicItem'
import { trackMenuCapabilities } from './trackMenuCapabilities'

jest.mock('./pluginState', () => ({
  activePluginContributions: {
    value: [
      {
        pluginId: 'catalog-install',
        descriptor: {
          id: 'catalog.plugin',
          hasShareResolver: false,
          providers: [{ id: 'wy', qualities: ['flac'] }]
        },
        providerMethods: { wy: ['tracks.resolve', 'sharing.describe'] },
        actionIds: []
      },
      {
        pluginId: 'share-install',
        descriptor: {
          id: 'share.plugin',
          hasShareResolver: true,
          providers: [{ id: 'wy', qualities: ['flac'] }]
        },
        providerMethods: { wy: ['tracks.resolve'] },
        actionIds: ['comments.hot']
      }
    ]
  }
}))

const song = { songmid: '1', source: 'wy' } as MusicItem

it('finds comment and website support in active plugins for a public platform song', () => {
  expect(
    trackMenuCapabilities({
      ...song,
      pluginResource: { providerId: 'wy', kind: 'track', id: '1', scope: 'provider' }
    })
  ).toEqual({ comments: true, websiteShare: true })
})

it('keeps private songs bound to their own plugin and requires an actual website resolver', () => {
  expect(
    trackMenuCapabilities({
      ...song,
      pluginResource: {
        providerId: 'wy',
        kind: 'track',
        id: '1',
        pluginId: 'catalog.plugin',
        connectionId: 'one'
      }
    })
  ).toEqual({ comments: false, websiteShare: false })
})

it('keeps plugin-only actions hidden for local files and unmatched sources', () => {
  for (const source of ['local', 'am']) {
    expect(trackMenuCapabilities({ ...song, source })).toEqual({
      comments: false,
      websiteShare: false
    })
  }
})
