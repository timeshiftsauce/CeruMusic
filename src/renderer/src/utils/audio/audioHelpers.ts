export const strSim = (s1: string, s2: string) => {
  const t1 = (s1 || '').toLowerCase().trim()
  const t2 = (s2 || '').toLowerCase().trim()
  if (t1 === t2) return 1
  const bigrams = (str: string) => {
    const res = new Set<string>()
    for (let i = 0; i < str.length - 1; i++) {
      res.add(str.substring(i, i + 2))
    }
    return res
  }
  const b1 = bigrams(t1)
  const b2 = bigrams(t2)
  if (b1.size === 0 || b2.size === 0) return t1 === t2 ? 1 : 0
  let inter = 0
  b1.forEach((x) => {
    if (b2.has(x)) inter++
  })
  return (2.0 * inter) / (b1.size + b2.size)
}

export const parseInterval = (timeStr: string | undefined) => {
  if (!timeStr) return 0
  const parts = timeStr.split(':')
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
  }
  return 0
}

export const waitForAudioReady = (audio: HTMLAudioElement, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    if (!audio) {
      reject(new Error('音频元素未初始化'))
      return
    }
    if (audio.readyState >= 3) {
      resolve()
      return
    }
    const cleanup = () => {
      clearTimeout(timeout)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('音频加载超时'))
    }, 10000)
    const onCanPlay = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('音频加载失败'))
    }
    const onAbort = () => {
      cleanup()
      reject(signal?.reason)
    }
    audio.addEventListener('canplay', onCanPlay, { once: true })
    audio.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
