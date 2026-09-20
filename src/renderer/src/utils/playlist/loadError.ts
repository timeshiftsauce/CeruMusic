/** Keep implementation errors in logs; the playlist view shows useful recovery guidance. */
export function playlistLoadErrorMessage(error: unknown): string {
  const reason = String(
    error && typeof error === 'object' && 'message' in error ? error.message : error
  )
  if (/权限|未授权|permission|not authorized/i.test(reason))
    return '当前音源缺少访问权限，请在设置的插件权限中允许后重试。'
  if (/429|限流|频繁|rate.limit/i.test(reason)) return '平台请求较多，请稍等片刻再试。'
  if (/404|不存在|已删除|私密|公开|无法访问/i.test(reason))
    return '暂时无法访问这张歌单，请确认歌单仍存在且已公开。'
  if (/timeout|timed.out|超时|network|fetch|网络|断开|连接/i.test(reason))
    return '暂时连接不上音乐服务，请检查网络后重试。'
  if (/Cannot read|undefined|null|TypeError|SyntaxError|数据|格式|结构/i.test(reason))
    return '音源暂时未能读取这张歌单，请重试或更换音源插件。'
  return '这张歌单暂时无法加载，请稍后重试或更换音源插件。'
}
