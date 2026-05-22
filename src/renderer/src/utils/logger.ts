/**
 * 生产环境安全日志工具
 *
 * 在开发环境（Vite dev server）下与 console.log 行为一致；
 * 在生产构建（electron-vite build）中 log/warn 被编译为 noop，
 * 消除热路径中字符串拼接的开销。
 *
 * error 始终保留，确保关键错误可见。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogFn = (...args: any[]) => void

const devLog: LogFn = import.meta.env.DEV
  ? (...args) => console.log(...args)
  : () => {}

const devWarn: LogFn = import.meta.env.DEV
  ? (...args) => console.warn(...args)
  : () => {}

export const logger = {
  log: devLog,
  warn: devWarn,
  error: (...args: unknown[]) => {
    console.error(...args)
  }
}