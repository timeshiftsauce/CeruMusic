export const bHh = '624868746c'

export const headers = {
  'User-Agent': 'lx-music request',
  [bHh]: [bHh]
}

export const timeout = 15000

// 添加 getOptions 函数
export const getOptions = () => {
  return {
    headers,
    timeout
  }
}
