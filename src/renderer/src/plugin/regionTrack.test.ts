import { createTrackRevision, playbackIdentity } from './regionTrack'

test('same metadata is not the identity of a playback region', () => {
  const first = { name: 'Shared title', singer: 'Shared artist', source: 'local', songmid: 'one' }
  const second = { ...first, songmid: 'two' }
  expect(playbackIdentity(second)).not.toBe(playbackIdentity(first))
  expect(playbackIdentity({ ...first, source: 'another' })).not.toBe(playbackIdentity(first))
  const revision = createTrackRevision()
  expect(revision(null)).toBe(0)
  expect(revision(first)).toBe(1)
  const renamed = { ...first, name: 'New title' }
  expect(revision(renamed)).toBe(1)
  expect(revision(second)).toBe(2)
  expect(revision(second)).toBe(2)
  expect(revision(null)).toBe(3)
  expect(revision(first)).toBe(4)
})

test('private provider accounts get distinct host-only identities and numeric revisions', () => {
  const ref = { kind: 'track', id: 'same', pluginId: 'music', providerId: 'catalog', connectionId: 'account-a' }
  const revision = createTrackRevision()
  expect(revision({pluginResource:ref})).toBe(1)
  const other = {...ref, connectionId:'account-b'}
  expect(revision({pluginResource:other})).toBe(2)
  expect(revision({pluginResource:other})).toBe(2)
})
