/*
 * 插件日志器
 *
 * 设计要点：
 *  - 每条日志写入一行 NDJSON（JSON-per-line），包含真实时间戳 / 真实级别 / 真实分组。
 *    例：{"t":1716537600123,"l":"info","m":"hello"}
 *  - getLog() 返回原始字符串数组，由前端解析。新行是 NDJSON；旧的非 NDJSON 行
 *    （历史 `level message` 文本日志）会被前端按 fallback 规则解析，向下兼容。
 *  - 通过 add_promise 串行化对同一文件的写，避免多 host 并发 append 出现行错乱。
 *  - 读取时若超过 MAX_LOG_LINES 自动裁剪，避免日志无限增长。
 */

import path from 'path'
import fsPromise from 'fs/promises'

import { getAppDirPath } from '../../utils/path'
import { remove_empty_strings } from '../../utils/array'

/** 日志级别（向下兼容老 4 级 + group/groupEnd + debug）。 */
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'group' | 'groupEnd'

/** 单行结构化日志记录。 */
export interface PluginLogEntry {
  /** epoch ms */
  t: number
  /** level */
  l: LogLevel
  /** message（args 已被序列化为字符串） */
  m: string
}

/** 保留最近多少行；超出时在读取时顺手裁剪。 */
const MAX_LOG_LINES = 500

function getLogPath(pluginId: string): string {
  return path.join(getAppDirPath(), 'plugins', 'logs', `${pluginId}.txt`)
}

const fileLock: Record<string, Promise<any> | undefined> = {}
const waitNum: Record<string, number | undefined> = {}

async function appendLine(logPath: string, line: string): Promise<void> {
  await add_promise(logPath, fsPromise.appendFile(logPath, line))
}

async function overwriteContent(logPath: string, content: string): Promise<void> {
  await add_promise(logPath, fsPromise.writeFile(logPath, content))
}

async function add_promise<T>(key: string, promise: Promise<T>): Promise<T> {
  const promiseDeleteCheck = async (p: Promise<T>): Promise<T> => {
    waitNum[key] = waitNum[key] ? (waitNum[key] as number) + 1 : 1
    try {
      return await p
    } finally {
      ;(waitNum[key] as number) -= 1
      if (waitNum[key] === 0) {
        delete fileLock[key]
      }
    }
  }
  if (!fileLock[key]) {
    fileLock[key] = promiseDeleteCheck(promise)
  } else {
    fileLock[key] = promiseDeleteCheck(
      (fileLock[key] as Promise<any>).then(async () => promise)
    )
  }
  return fileLock[key] as Promise<T>
}

class Logger {
  private readonly logFilePath: string

  constructor(pluginId: string) {
    this.logFilePath = getLogPath(pluginId)
    fsPromise.mkdir(path.dirname(this.logFilePath), { recursive: true }).then()
  }

  log(...args: any[]): void {
    this.write('log', args)
  }

  info(...args: any[]): void {
    this.write('info', args)
  }

  warn(...args: any[]): void {
    this.write('warn', args)
  }

  error(...args: any[]): void {
    this.write('error', args)
  }

  debug(...args: any[]): void {
    this.write('debug', args)
  }

  group(...args: any[]): void {
    this.write('group', args)
  }

  groupEnd(...args: any[]): void {
    this.write('groupEnd', args)
  }

  private write(level: LogLevel, args: any[]): void {
    const entry: PluginLogEntry = {
      t: Date.now(),
      l: level,
      m: parseArgs(args)
    }
    // 一行一条 JSON。日志是 best-effort，写失败静默吞掉，不能阻塞插件主流程。
    appendLine(this.logFilePath, JSON.stringify(entry) + '\n').catch(() => {})
  }
}

function parseArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    })
    .join(' ')
}

/**
 * 读取插件日志。返回原始字符串行，由前端做 NDJSON 解析 + 旧格式 fallback。
 * 超过 MAX_LOG_LINES 时顺手裁剪一次。
 */
async function getLog(pluginId: string): Promise<string[]> {
  const logFilePath: string = getLogPath(pluginId)
  return await add_promise(
    logFilePath,
    (async (): Promise<string[]> => {
      let content = ''
      try {
        content = await fsPromise.readFile(logFilePath, 'utf-8')
      } catch (err: any) {
        if (err?.code === 'ENOENT') return []
        throw err
      }
      const allLines = remove_empty_strings(content.split('\n'))
      if (allLines.length > MAX_LOG_LINES) {
        const tail = allLines.slice(-MAX_LOG_LINES)
        // 异步裁剪，不阻塞返回；写失败也无伤大雅
        overwriteContent(logFilePath, tail.join('\n') + '\n').catch(() => {})
        return tail
      }
      return allLines
    })()
  )
}

export default Logger
export { Logger, getLog }
