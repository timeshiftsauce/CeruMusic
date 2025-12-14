import type { SongList } from '@renderer/types/audio'
import CryptoJS from 'crypto-js'

// 加密密钥，实际应用中应该使用更安全的方式存储
const SECRET_KEY = 'CeruMusic-PlaylistSecretKey'

/**
 * 加密播放列表数据
 * @param data 要加密的数据
 * @returns 加密后的字符串
 */
export function encryptPlaylist(data: SongList[]): string {
  try {
    const jsonString = JSON.stringify(data)
    const encrypted = CryptoJS.AES.encrypt(jsonString, SECRET_KEY).toString()
    return encrypted
  } catch (error) {
    console.error('加密播放列表失败:', error)
    throw new Error('加密播放列表失败')
  }
}

/**
 * 解密播放列表数据
 * @param encryptedData 加密的数据字符串
 * @returns 解密后的播放列表数据
 */
export function decryptPlaylist(encryptedData: string): SongList[] {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY).toString(CryptoJS.enc.Utf8)
    return JSON.parse(decrypted) as SongList[]
  } catch (error) {
    console.error('解密播放列表失败:', error)
    throw new Error('解密播放列表失败或数据格式不正确')
  }
}

async function gzipString(str: string): Promise<Blob> {
  const cs = new CompressionStream('gzip')
  const stream = new Blob([str]).stream().pipeThrough(cs)
  return await new Response(stream).blob()
}

async function gunzipToString(input: ArrayBuffer | Blob): Promise<string> {
  const ds = new DecompressionStream('gzip')
  const inStream = input instanceof Blob ? input.stream() : new Blob([input]).stream()
  const stream = inStream.pipeThrough(ds)
  return await new Response(stream).text()
}

function getExtFromPath(p: string): string {
  const m = p.match(/\.([^.]+)$/)
  return m ? m[1].toLowerCase() : ''
}

/**
 * 从系统路径导入播放列表（支持 .cmpl/.cpl）
 */
export async function importPlaylistFromPath(path: string): Promise<SongList[]> {
  const buf = await (window as any).api.file.readFile(path)
  const ext = getExtFromPath(path)
  if (ext === 'cpl') {
    const text = new TextDecoder().decode(buf)
    return decryptPlaylist(text)
  }
  if (ext === 'cmpl') {
    const text = await gunzipToString(buf)
    return decryptPlaylist(text)
  }
  throw new Error('不支持的文件类型')
}

/**
 * 导出播放列表到文件
 * @param playlist 播放列表数据
 * @returns 下载的文件名
 */
export async function exportPlaylistToFile(
  playlist: SongList[],
  customFileName?: string
): Promise<string> {
  try {
    if (!playlist || playlist.length === 0) {
      throw new Error('播放列表为空')
    }

    const encryptedData = encryptPlaylist(playlist)
    const fileName =
      customFileName || `cerumusic-playlist-${new Date().toISOString().slice(0, 10)}.cmpl`

    const blob = await gzipString(encryptedData)

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName

    document.body.appendChild(link)
    link.click()

    setTimeout(() => {
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 100)

    return fileName
  } catch (error) {
    console.error('导出播放列表失败:', error)
    throw error
  }
}

/**
 * 将播放列表数据复制到剪贴板
 * @param playlist 播放列表数据
 */
export async function copyPlaylistToClipboard(playlist: SongList[]): Promise<void> {
  try {
    if (!playlist || playlist.length === 0) {
      throw new Error('播放列表为空')
    }

    const encryptedData = encryptPlaylist(playlist)

    // 复制到剪贴板
    await navigator.clipboard.writeText(encryptedData)
  } catch (error) {
    console.error('复制播放列表到剪贴板失败:', error)
    throw error
  }
}

/**
 * 从文件导入播放列表
 * @param file 导入的文件
 * @returns Promise<SongList[]> 解析后的播放列表数据
 */
export function importPlaylistFromFile(file: File): Promise<SongList[]> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('未选择文件'))
      return
    }

    const isCompressed = file.name.endsWith('.cmpl')
    const isLegacy = file.name.endsWith('.cpl')
    if (!isCompressed && !isLegacy) {
      reject(new Error('文件格式不正确，请选择.cmpl或.cpl格式的播放列表文件'))
      return
    }

    const reader = new FileReader()

    reader.onload = async (event) => {
      try {
        if (!event.target || event.target.result == null) {
          throw new Error('读取文件失败')
        }

        if (isLegacy) {
          if (typeof event.target.result !== 'string') throw new Error('读取文件失败')
          const encryptedData = event.target.result
          const playlist = decryptPlaylist(encryptedData)
          resolve(playlist)
          return
        }

        const buf = event.target.result as ArrayBuffer

        const encryptedText = await gunzipToString(buf)
        const playlist = decryptPlaylist(encryptedText)
        resolve(playlist)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => {
      reject(new Error('读取文件失败'))
    }

    if (isLegacy) {
      reader.readAsText(file)
    } else {
      reader.readAsArrayBuffer(file)
    }
  })
}

/**
 * 从剪贴板导入播放列表
 * @returns Promise<SongList[]> 解析后的播放列表数据
 */
export async function importPlaylistFromClipboard(): Promise<SongList[]> {
  try {
    const clipboardText = await navigator.clipboard.readText()

    if (!clipboardText) {
      throw new Error('剪贴板为空')
    }

    return decryptPlaylist(clipboardText)
  } catch (error) {
    console.error('从剪贴板导入播放列表失败:', error)
    throw error
  }
}

/**
 * 验证导入的播放列表数据是否有效
 * @param playlist 播放列表数据
 * @returns boolean 是否有效
 */
export function validateImportedPlaylist(playlist: any[]): boolean {
  if (!Array.isArray(playlist) || playlist.length === 0) {
    return false
  }

  // 验证每个歌曲对象是否包含必要的字段
  return playlist.every(
    (song) =>
      song.songmid &&
      song.name &&
      typeof song.img === 'string' &&
      typeof song.singer === 'string' &&
      typeof song.interval === 'string' &&
      typeof song.source === 'string'
  )
}
