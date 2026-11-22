export function pluginInstallErrorMessage(error: unknown): string {
  const detail =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error ?? '')
  const normalized = detail.toLowerCase()

  if (
    normalized.includes('incorrect keyid') ||
    normalized.includes('signature verification') ||
    normalized.includes('invalid signature') ||
    normalized.includes('signature mismatch')
  ) {
    return [
      '插件签名校验失败，软件无法确认插件内容与签名相符。文件可能已被修改或损坏，也可能使用了当前无法识别的签名密钥。',
      '为保护设备，安装已被阻止。请从插件作者提供的可信渠道重新下载原始插件文件后再试。',
      detail ? `校验详情：${detail}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  }

  return detail || '未知错误，请稍后重试'
}
