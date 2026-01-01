// 非业务工具方法

/**
 * 获取两个数之间的随机整数，大于等于min，小于max
 * @param {*} min
 * @param {*} max
 */
export const getRandom = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min)) + min

export const sizeFormate = (size: number): string => {
  // https://gist.github.com/thomseddon/3511330
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

/**
 * 将字符串、时间戳等格式转成时间对象
 * @param date 时间
 * @returns 时间对象或空字符串
 */
export const toDateObj = (date: any): Date | '' => {
  // console.log(date)
  if (!date) return ''
  switch (typeof date) {
    case 'string':
      if (!date.includes('T')) date = date.split('.')[0].replace(/-/g, '/')

    case 'number':
      date = new Date(date)

    case 'object':
      break
    default:
      return ''
  }
  return date
}

const numFix = (n: number): string => (n < 10 ? `0${n}` : n.toString())
/**
 * 时间格式化
 * @param _date 时间
 * @param format Y-M-D h:m:s Y年 M月 D日 h时 m分 s秒
 */
export const dateFormat = (_date: any, format = 'Y-M-D h:m:s') => {
  // console.log(date)
  const date = toDateObj(_date)
  if (!date) return ''
  return format
    .replace('Y', date.getFullYear().toString())
    .replace('M', numFix(date.getMonth() + 1))
    .replace('D', numFix(date.getDate()))
    .replace('h', numFix(date.getHours()))
    .replace('m', numFix(date.getMinutes()))
    .replace('s', numFix(date.getSeconds()))
}

export const formatPlayTime = (time: number) => {
  const m = Math.trunc(time / 60)
  const s = Math.trunc(time % 60)
  return m == 0 && s == 0 ? '--/--' : numFix(m) + ':' + numFix(s)
}

export const formatPlayTime2 = (time: number) => {
  const m = Math.trunc(time / 60)
  const s = Math.trunc(time % 60)
  return numFix(m) + ':' + numFix(s)
}

export const isUrl = (path: string) => /https?:\/\//.test(path)

// 解析URL参数为对象
export const parseUrlParams = (str: string): Record<string, string> => {
  const params: Record<string, string> = {}
  if (typeof str !== 'string') return params
  const paramsArr = str.split('&')
  for (const param of paramsArr) {
    const [key, value] = param.split('=')
    params[key] = value
  }
  return params
}

/**
 * 生成节流函数
 * @param fn 回调
 * @param delay 延迟
 * @returns
 */
export function throttle<Args extends any[]>(
  fn: (...args: Args) => void | Promise<void>,
  delay = 100
) {
  let timer: NodeJS.Timeout | null = null
  let _args: Args
  return (...args: Args) => {
    _args = args
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      void fn(..._args)
    }, delay)
  }
}

/**
 * 生成防抖函数
 * @param fn 回调
 * @param delay 延迟
 * @returns
 */
export function debounce<Args extends any[]>(
  fn: (...args: Args) => void | Promise<void>,
  delay = 100
) {
  let timer: NodeJS.Timeout | null = null
  let _args: Args
  return (...args: Args) => {
    _args = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void fn(..._args)
    }, delay)
  }
}

const fileNameRxp = /[\\/:*?#"<>|]/g
export const filterFileName = (name: string): string => name.replace(fileNameRxp, '')

// https://blog.csdn.net/xcxy2015/article/details/77164126#comments
/**
 *
 * @param a
 * @param b
 */
export const similar = (a: string, b: string) => {
  if (!a || !b) return 0
  if (a.length > b.length) {
    // 保证 a <= b
    const t = b
    b = a
    a = t
  }
  const al = a.length
  const bl = b.length
  const mp: number[] = [] // 一个表
  let i, j, ai, lt, tmp // ai：字符串a的第i个字符。 lt：左上角的值。 tmp：暂存新的值。
  for (i = 0; i <= bl; i++) mp[i] = i
  for (i = 1; i <= al; i++) {
    ai = a.charAt(i - 1)
    lt = mp[0]
    mp[0] = mp[0] + 1
    for (j = 1; j <= bl; j++) {
      tmp = Math.min(mp[j] + 1, mp[j - 1] + 1, lt + (ai == b.charAt(j - 1) ? 0 : 1))
      lt = mp[j]
      mp[j] = tmp
    }
  }
  return 1 - mp[bl] / bl
}

/**
 * 排序字符串
 * @param arr
 * @param data
 */
export const sortInsert = <T>(
  arr: Array<{ num: number; data: T }>,
  data: { num: number; data: T }
) => {
  const key = data.num
  let left = 0
  let right = arr.length - 1

  while (left <= right) {
    const middle = Math.trunc((left + right) / 2)
    if (key == arr[middle].num) {
      left = middle
      break
    } else if (key < arr[middle].num) {
      right = middle - 1
    } else {
      left = middle + 1
    }
  }
  while (left > 0) {
    if (arr[left - 1].num != key) break
    left--
  }

  arr.splice(left, 0, data)
}

export const encodePath = (path: string) => {
  return encodeURI(path.replaceAll('\\', '/'))
}

export const arrPush = <T>(list: T[], newList: T[]) => {
  for (let i = 0; i * 1000 < newList.length; i++) {
    list.push(...newList.slice(i * 1000, (i + 1) * 1000))
  }
  return list
}

export const arrUnshift = <T>(list: T[], newList: T[]) => {
  for (let i = 0; i * 1000 < newList.length; i++) {
    list.splice(i * 1000, 0, ...newList.slice(i * 1000, (i + 1) * 1000))
  }
  return list
}

export const arrPushByPosition = <T>(list: T[], newList: T[], position: number) => {
  for (let i = 0; i * 1000 < newList.length; i++) {
    list.splice(position + i * 1000, 0, ...newList.slice(i * 1000, (i + 1) * 1000))
  }
  return list
}

// https://stackoverflow.com/a/2450976
export const arrShuffle = <T>(array: T[]) => {
  let currentIndex = array.length
  let randomIndex

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex--

      // And swap it with the current element.
      ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
  }

  return array
}


// 更简洁的版本，更符合你的示例
export function formatNumberToChineseSimple(num: number) {
  let number = typeof num === 'string' ? parseFloat(num) : num;

  if (isNaN(number)) return '0';

  const isNegative = number < 0;
  number = Math.abs(number);

  // 处理亿级
  if (number >= 100000000) {
    const value = number / 100000000;
    // 亿级别总是显示1位小数
    const formattedValue = value.toFixed(1);
    // 如果小数部分为0，则去掉小数
    const resultValue = parseFloat(formattedValue).toString();
    return (isNegative ? '-' : '') + resultValue + '亿';
  }

  // 处理万级
  if (number >= 10000) {
    const value = number / 10000;
    // 万级别：如果小数部分为0则不显示小数
    const fixedValue = value.toFixed(1);
    const resultValue = parseFloat(fixedValue).toString();
    return (isNegative ? '-' : '') + resultValue + '万';
  }

  // 小于1万，直接返回整数
  return (isNegative ? '-' : '') + Math.round(number).toString();
}


interface FormatMinutesOptions {
  minuteThreshold?: number;
  hourThreshold?: number;
  tenThousandThreshold?: number;
  hourDecimal?: number;
  tenThousandDecimal?: number;
}

// 更灵活的版本，可以自定义阈值
export function formatMinutesFlexible(minutes: number, options: FormatMinutesOptions = {}) {
  const {
    minuteThreshold = 3000,      // 分钟阈值，超过则转换为小时
    hourThreshold = 14400,        // 小时阈值，超过则取整显示
    tenThousandThreshold = 200000, // 万小时阈值
    hourDecimal = 1,              // 小时的小数位数
    tenThousandDecimal = 1        // 万小时的小数位数
  } = options;

  if (typeof minutes !== 'number' || isNaN(minutes)) {
    return '0分钟';
  }

  const isNegative = minutes < 0;
  const absMinutes = Math.abs(minutes);

  let result;

  if (absMinutes < minuteThreshold) {
    result = `${Math.round(absMinutes)}分钟`;
  } else if (absMinutes < hourThreshold) {
    const hours = absMinutes / 60;
    result = `${hours.toFixed(hourDecimal)}小时`;
  } else if (absMinutes < tenThousandThreshold) {
    const hours = absMinutes / 60;
    result = `${Math.round(hours)}小时`;
  } else {
    const tenThousandHours = absMinutes / 60 / 10000;
    // 移除尾随的零
    const formattedHours = parseFloat(tenThousandHours.toFixed(tenThousandDecimal)).toString();
    result = `${formattedHours}万小时`;
  }

  return isNegative ? `-${result}` : result;
}
