// 导入通用工具函数
import { dateFormat } from '../../common/utils/common'

// 导出通用工具函数
export * from '../../common/utils/nodejs'
export * from '../../common/utils/common'
export * from '../../common/utils/tools'

/**
 * 格式化播放数量
 * @param {*} num 数字
 */
export const formatPlayCount = (num: number): string => {
  if (num > 100000000) return `${Math.trunc(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.trunc(num / 1000) / 10}万`
  return String(num)
}

/**
 * 时间格式化 - 主进程版本
 */
export const dateFormat2 = (time: number): string => {
  const differ = Math.trunc((Date.now() - time) / 1000)
  if (differ < 60) {
    return `${differ}秒前`
  } else if (differ < 3600) {
    return `${Math.trunc(differ / 60)}分钟前`
  } else if (differ < 86400) {
    return `${Math.trunc(differ / 3600)}小时前`
  } else {
    return dateFormat(time)
  }
}

// 定义简单的音乐信息接口
interface MusicInfo {
  id: string
  [key: string]: any
}

export const deduplicationList = <T extends MusicInfo>(list: T[]): T[] => {
  const ids = new Set<string>()
  return list.filter((s) => {
    if (ids.has(s.id)) return false
    ids.add(s.id)
    return true
  })
}

// 主进程中的字符串解码函数
export const decodeName = (str: string | null = '') => {
  if (!str) return ''
  // 在 Node.js 中使用简单的 HTML 实体解码
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
