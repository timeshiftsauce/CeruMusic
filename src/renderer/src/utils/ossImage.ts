/**
 * 阿里云 OSS 图片处理 URL 拼接
 *
 * 用于:
 *  - 社区列表的封面缩略图 (省流量,加快首屏)
 *  - 渐进式加载的模糊占位图 (~5KB,触发 onload 立即显示)
 *  - 详情页大图 (限定长边避免拉满源图)
 *
 * 检测 host 决定是否拼参数 —— 外部 URL(用户头像可能是 logto 域)不动。
 *
 * OSS 处理参数文档:
 *   image/resize,w_640,m_lfit/quality,q_80/format,webp
 *
 * 注意: 整个 process 串作为 query value 必须 URL encode,否则 "/" 会被 nginx
 *       吞掉路径段。我们用 encodeURIComponent。
 */

/** 项目自定义 OSS 域名 + 阿里云原生域 */
const OSS_HOST_PATTERNS: Array<string | RegExp> = [
  'cqoss.shiqianjiang.cn',
  /\.aliyuncs\.com$/i
]

function isOssUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return OSS_HOST_PATTERNS.some((h) =>
      typeof h === 'string' ? u.host === h : h.test(u.host)
    )
  } catch {
    return false
  }
}

export interface OssImageOpts {
  /** 长边像素,m_lfit 即等比缩放不放大 */
  w?: number
  /** 质量 1-100 */
  q?: number
  /** 模糊: r 半径 1-50, s 标准差 1-50;两者越大越糊 */
  blur?: { r: number; s: number }
  /** 输出格式;webp 通常体积最小 */
  format?: 'webp' | 'jpg' | 'png'
}

/**
 * 给 OSS 图片 URL 拼处理参数;非 OSS URL 原样返回
 *
 * @example
 *   ossImage('https://cqoss.shiqianjiang.cn/x.webp', { w: 640, q: 80 })
 *   -> '.../x.webp?x-oss-process=image%2Fresize%2Cw_640%2Cm_lfit%2Fquality%2Cq_80'
 */
export function ossImage(
  url: string | undefined | null,
  opts: OssImageOpts = {}
): string {
  if (!url) return ''
  if (!isOssUrl(url)) return url

  const parts: string[] = []
  if (opts.w) parts.push(`resize,w_${opts.w},m_lfit`)
  if (opts.q !== undefined) parts.push(`quality,q_${opts.q}`)
  if (opts.blur) parts.push(`blur,r_${opts.blur.r},s_${opts.blur.s}`)
  if (opts.format) parts.push(`format,${opts.format}`)

  if (parts.length === 0) return url

  const process = `image/${parts.join('/')}`
  const sep = url.includes('?') ? '&' : '?'
  // x-oss-process 的 value 部分一律 encode,确保经 CDN/反代时 "/" 不被吃
  return `${url}${sep}x-oss-process=${encodeURIComponent(process)}`
}

/* ====== 业务预设 —— 统一一处改尺寸 ====== */

/** 模糊占位图: 60px 宽 + 重模糊 + 低质量,通常 < 5KB */
export const ossThumb = (url: string | undefined | null) =>
  ossImage(url, { w: 60, q: 30, blur: { r: 10, s: 3 }, format: 'webp' })

/** 卡片列表的封面: 适配 2-6 列瀑布流,640 宽对 hidpi 屏也够 */
export const ossCard = (url: string | undefined | null) =>
  ossImage(url, { w: 640, q: 80, format: 'webp' })

/** 详情页大图: 限到 1600 长边,避免拉原图 */
export const ossDetail = (url: string | undefined | null) =>
  ossImage(url, { w: 1600, q: 88, format: 'webp' })

/** 小图标(头像/歌单封面缩略): 120 宽 */
export const ossAvatar = (url: string | undefined | null) =>
  ossImage(url, { w: 120, q: 80, format: 'webp' })
