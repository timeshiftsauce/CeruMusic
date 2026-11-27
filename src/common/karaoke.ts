export type PackId = 'karaoke-duo' | 'spleeter-five'
export interface ModelFile {
  name: string
  bytes: number
  sha256: string
}
export interface KaraokePack {
  id: PackId
  name: string
  stems: string[]
  base: string
  files: ModelFile[]
}
export const karaokePacks: KaraokePack[] = [
  {
    id: 'karaoke-duo',
    name: '轻量双轨',
    stems: ['人声', '伴奏'],
    base: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/',
    files: [
      {
        name: 'UVR_MDXNET_KARA.onnx',
        bytes: 29704738,
        sha256: '4e1cddd765cac6a55785cf28938d02b4ca100cf9ad84d9d86ff1118a50fff8fe'
      }
    ]
  },
  {
    id: 'spleeter-five',
    name: '乐器五轨',
    stems: ['人声', '鼓', '贝斯', '钢琴', '其他'],
    base: 'https://github.com/matthewbae/spleeter-onnx-models/releases/download/spleeter-5stems-onnx-v1/',
    files: [
      {
        name: 'spleeter-5stem-vocals-logits-fp16.onnx',
        bytes: 19662097,
        sha256: '26b640cfd7f782dbc4a6de0e1f85590ce86529d7c1bff78e4c0fc4551d4d97bd'
      },
      {
        name: 'spleeter-5stem-drums-logits-fp16.onnx',
        bytes: 19662464,
        sha256: '6f9343d65b5d56ba27d4dc0d5df026304c4437802b90d60e615063e56c7d87fe'
      },
      {
        name: 'spleeter-5stem-bass-logits-fp16.onnx',
        bytes: 19662446,
        sha256: 'a06adb692990dd3bb9aabf1cf3068b93036d1f6ae1aba68dc59a2d2230fdc650'
      },
      {
        name: 'spleeter-5stem-piano-logits-fp16.onnx',
        bytes: 19662381,
        sha256: '0c11f8124dc5dfe60229dd8c42c003d195aeae7830c8c7b598a84b29770e2d38'
      },
      {
        name: 'spleeter-5stem-other-logits-fp16.onnx',
        bytes: 19662448,
        sha256: '9638fb7dbc8a3bdcf28d68dd1a4c0bf57d5af339d434f9ccd53d6f0c0744b039'
      }
    ]
  }
]
export function packBytes(pack: KaraokePack) {
  return pack.files.reduce((sum, file) => sum + file.bytes, 0)
}
export type ModelPhase =
  | 'absent'
  | 'probing'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'ready'
  | 'failed'
  | 'cancelled'
export interface ModelDownload {
  id: PackId
  phase: ModelPhase
  bytes: number
  message: string
  createdAt: number
  historyHidden?: boolean
  speed?: number
}
export interface SeparatedAudio {
  sampleRate: number
  stems: Float32Array[][]
}
export interface KaraokeApi {
  status(): Promise<ModelDownload[]>
  download(id: PackId): Promise<void>
  pause(id: PackId): Promise<void>
  cancel(id: PackId, keepRecord?: boolean): Promise<void>
  forget(id: PackId): Promise<void>
  openLocation(id: PackId): Promise<void>
  remove(id: PackId): Promise<void>
  separate(id: PackId, samples: Float32Array[], sampleRate: number): Promise<SeparatedAudio>
  fileSize(url: string): Promise<number>
  readFile(url: string, start: number, end: number): Promise<Uint8Array>
  release(): Promise<void>
  subscribe(callback: (state: ModelDownload) => void): () => void
}
export const modelPhaseLabel: Record<ModelPhase, string> = {
  absent: '未安装',
  probing: '正在测速',
  downloading: '正在下载',
  paused: '已暂停',
  verifying: '正在校验',
  ready: '已安装',
  failed: '下载失败',
  cancelled: '已取消'
}
