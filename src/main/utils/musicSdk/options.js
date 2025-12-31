export const bHh = '624868746c'

export const headers = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36'
}

export const timeout = 15000

// 添加 getOptions 函数
export const getOptions = () => {
  return {
    headers,
    timeout
  }
}
