export const formatMusicInfo = (template: string, data: any) => {
  // 定义占位符映射，支持多字段回退
  const patterns = {
    '%t': ['name'],
    '%s': ['singer'],
    '%a': ['albumName'],
    '%u': ['source', 'platform'],
    '%d': ['date']
  }

  // 一次性替换所有占位符
  let result = template || '%t - %s'

  // 使用正则匹配所有占位符
  result = result.replace(/%[tsaud]/g, (match: string) => {
    const keys = patterns[match]
    if (!keys) return match

    for (const key of keys) {
      if (data[key] !== undefined) return data[key]
    }
    return match
  })

  return result
}
