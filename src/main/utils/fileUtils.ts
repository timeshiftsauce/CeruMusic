import crypto from 'crypto'
import fs from 'fs'

export function md5(input: string) {
  return crypto.createHash('md5').update(input).digest('hex')
}

export function normPath(p?: string | null): string | null {
  if (!p || typeof p !== 'string') return null
  return p
    .replace(/^file:\/\//i, '')
    .replace(/\\/g, '/')
    .toLowerCase()
}

export function genId(input: string) {
  return md5(input)
}

export function genCoverKey(filePath: string) {
  try {
    const st = fs.statSync(filePath)
    return md5(`${filePath}:${st.mtimeMs}`)
  } catch {
    return md5(filePath)
  }
}
