import type { InjectionKey, Ref } from 'vue'

/** The player's own refs, shared by every component region in this renderer. */
export const regionClock: InjectionKey<{
  currentTime: Readonly<Ref<number>>
  playing: Readonly<Ref<boolean>>
}> = Symbol('regionClock')
