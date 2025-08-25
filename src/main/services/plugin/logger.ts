import path from 'path'
import fsPromise from 'fs/promises'

import { getAppDirPath } from '../../utils/path'
import { remove_empty_strings } from '../../utils/array'

function getLogPath(pluginId: string): string {
  return path.join(getAppDirPath(), 'plugin', 'logs', `${pluginId}.txt`)
}

const fileLock: Record<string, Promise<any> | undefined> = {}
const waitNum: Record<string, number | undefined> = {}

enum WriteMode {
  APPEND,
  OVERWRITE
}

function selectWriteFunc(mode: WriteMode): (...args: any[]) => Promise<any> {
  switch (mode) {
    case WriteMode.APPEND:
      return async (filePath: string, content: string): Promise<void> => {
        await fsPromise.appendFile(filePath, content)
      }
    case WriteMode.OVERWRITE:
      return async (filePath: string, content: string): Promise<void> => {
        await fsPromise.writeFile(filePath, content)
      }
  }
}

async function writeLog(logPath: string, content: string, mode: WriteMode): Promise<void> {
  const writeFunc: (filePath: string, content: string) => Promise<void> = selectWriteFunc(mode)
  return await add_promise(logPath, writeFunc(logPath, content))
}

async function add_promise<T>(key: string, promise: Promise<T>): Promise<T> {
  const promiseDeleteCheck = async (promise: Promise<T>): Promise<T> => {
    waitNum[key] = waitNum[key] ? waitNum[key] + 1 : 1
    try {
      return await promise
    } finally {
      waitNum[key] -= 1
      if (waitNum[key] === 0) {
        delete fileLock[key]
      }
    }
  }
  if (!fileLock[key]) {
    fileLock[key] = promiseDeleteCheck(promise)
  } else {
    fileLock[key] = promiseDeleteCheck(
      (fileLock[key] as Promise<any>).then(async () => {
        return await promise
      })
    )
  }
  return fileLock[key]
}

class Logger {
  private readonly logFilePath: string
  constructor(pluginId: string) {
    this.logFilePath = getLogPath(pluginId)
    fsPromise.mkdir(path.dirname(this.logFilePath), { recursive: true }).then()
  }

  log(...args: any[]): void {
    this.write(`log ${parseArgs(args)}\n`)
  }

  info(...args: any[]): void {
    this.write(`info ${parseArgs(args)}\n`)
  }

  warn(...args: any[]): void {
    this.write(`warn ${parseArgs(args)}\n`)
  }

  error(...args: any[]): void {
    this.write(`error ${parseArgs(args)}\n`)
  }

  group(...args: any[]): void {
    args.unshift('groupStart---------')
    this.write(`start ${parseArgs(args)}\n`)
  }
  groupEnd(...args: any[]): void {
    this.write(`end ${parseArgs(args)}\n`)
  }

  private write(msg: string): void {
    writeLog(this.logFilePath, msg, WriteMode.APPEND).then()
  }
}

function parseArgs(args) {
  return args
    .map((arg) => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg)
      }

      return arg
    })
    .join(' ')
}

async function getLog(pluginId: string) {
  const logFilePath: string = getLogPath(pluginId)
  return await add_promise(
    logFilePath,
    (async (): Promise<string[]> => {
      const content: string = await fsPromise.readFile(logFilePath, 'utf-8')
      const last200Lines: string[] = remove_empty_strings(content.split('\n')).slice(-200)
      await selectWriteFunc(WriteMode.OVERWRITE)(logFilePath, last200Lines.join('\n'))
      return last200Lines
    })()
  )
}

export default Logger
export { Logger, getLog }
