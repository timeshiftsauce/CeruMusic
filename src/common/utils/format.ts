export const formatMusicInfo = (template: string, data: any) => {
  // 定义占位符映射，支持多字段回退
  const patterns = {
    '%t': ['name'],
    '%s': ['singer'],
    '%a': ['albumName'],
    '%u': ['source', 'platform'],
    '%d': ['date'],
    '%q': ['quality']
  }

  // 一次性替换所有占位符
  let result = template || '%t - %s'

  // 使用正则匹配所有占位符
  result = result.replace(/%[tsaudq]/g, (match: string) => {
    const d = new Date()
    const keys = patterns[match]
    if (!keys) return match

    for (const key of keys) {
      if (data[key] !== undefined)
        return (
          data[key] ??
          (match === '%d' && !data.date
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
                2,
                '0'
              )}-${String(d.getDate()).padStart(2, '0')}`
            : null)
        )
    }
    return match
  })

  return result
}
