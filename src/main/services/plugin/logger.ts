import path from 'path'
import fs from 'fs'
import fsPromise from 'fs/promises'

import { getAppDirPath } from '../../utils/path'

class Logger {
  private readonly logFilePath: string
  constructor(pluginId: string) {
    this.logFilePath = path.join(getAppDirPath(), pluginId, 'log.txt')
    fsPromise.mkdir(path.dirname(this.logFilePath), { recursive: true }).then()
  }

  info(...args: any[]) {
    this.write(`info ${args.join(' ')}`)
  }

  warn(...args: any[]) {
    this.write(`warn ${args.join(' ')}`)
  }

  error(...args: any[]) {
    this.write(`error ${args.join(' ')}`)
  }

  private write(msg: string) {
    fs.appendFileSync(this.logFilePath, `${msg}\n`)
  }
}

export default Logger
