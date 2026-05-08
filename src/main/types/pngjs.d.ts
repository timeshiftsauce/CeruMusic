declare module 'pngjs' {
  export interface PNGOptions {
    width?: number
    height?: number
    colorType?: number
    bitDepth?: number
    inputColorType?: number
    inputHasAlpha?: boolean
    bgColor?: { red: number; green: number; blue: number }
    filterType?: number
    deflateLevel?: number
    deflateStrategy?: number
  }

  export class PNG {
    constructor(options?: PNGOptions)
    width: number
    height: number
    data: Buffer
    static sync: {
      read(buffer: Buffer, options?: PNGOptions): PNG
      write(png: PNG, options?: PNGOptions): Buffer
    }
  }
}
