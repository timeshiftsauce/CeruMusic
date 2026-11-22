export function isDesktopDocument(actual: string, expected: string): boolean {
  try {
    const document = new URL(actual)
    const entry = new URL(expected)
    return ['file:', 'http:', 'https:'].includes(entry.protocol) &&
      document.protocol === entry.protocol && document.host === entry.host &&
      document.pathname === entry.pathname && !document.username && !document.password
  } catch { return false }
}
