export interface PluginInfo {
  name: string
  version: string
  author: string
  description: string
}

export interface SourceDetail {
  name: string
  type: string
  qualitys: string[]
}

export interface Sources {
  supportedSources: {
    [key: string]: SourceDetail
  }
}
