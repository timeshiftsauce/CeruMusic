import type { InjectionKey, Ref } from 'vue'
import { songKey } from '@common/musicItem'

export const regionTrackIdentity: InjectionKey<Readonly<Ref<string | number | null>>> = Symbol('regionTrackIdentity')

type Song = { songmid?: string | number | null; pluginResource?: { id?: string }; source?: string } | null | undefined

export function playbackIdentity(song: Song) {
  const id = song?.pluginResource?.id ?? song?.songmid
  return id == null || id === '' ? null : songKey(song)
}

export function createTrackRevision() {
  let previous: string | null = null, revision = 0
  return (song: Song) => {
    const next = playbackIdentity(song)
    if (next !== previous) { previous = next; revision++ }
    return revision
  }
}
