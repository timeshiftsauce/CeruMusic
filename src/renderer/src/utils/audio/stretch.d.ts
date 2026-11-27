declare module 'virtual:ceru-karaoke-stretch' {
  interface StretchNode extends AudioWorkletNode {
    schedule(change: {
      active: boolean
      input?: number
      output?: number
      rate?: number
      semitones?: number
    }): Promise<void>
    addBuffers(channels: Float32Array[], transfer?: ArrayBuffer[]): Promise<number>
    dropBuffers(before?: number): Promise<unknown>
  }
  export default function createStretch(
    ctx: AudioContext,
    options: AudioWorkletNodeOptions
  ): Promise<StretchNode>
}
