import DefaultCover from '@renderer/assets/images/Default.jpg'
import CoverImage from '@renderer/assets/images/cover.png'

/**
 * 颜色对象
 */
export interface Color {
  r: number
  g: number
  b: number
}

/**
 * 从图片中提取多个颜色
 * @param imageSrc 图片路径
 * @param colorCount 要提取的颜色数量
 * @returns 返回RGB颜色对象数组
 */
export async function extractColors(imageSrc: string, colorCount: number = 6): Promise<Color[]> {
  try {
    // 尝试提取主要颜色
    const dominantColor = await extractDominantColor(imageSrc)

    // 尝试提取次要颜色
    const secondaryColors = await extractSecondaryColors(imageSrc, colorCount - 1)

    // 合并主要颜色和次要颜色
    const colors: Color[] = [dominantColor, ...secondaryColors]

    // 如果提取的颜色不足，生成额外的变体颜色
    if (colors.length < colorCount) {
      for (let i = colors.length; i < colorCount; i++) {
        const variant = createColorVariant(dominantColor, i)
        colors.push(variant)
      }
    }

    return colors
  } catch (error) {
    console.error('提取多个颜色失败:', error)
    // 返回默认颜色组
    return [
      { r: 76, g: 116, b: 206 }, // 蓝色
      { r: 120, g: 80, b: 180 }, // 紫色
      { r: 60, g: 160, b: 160 }, // 青色
      { r: 180, g: 100, b: 80 }, // 橙红色
      { r: 100, g: 140, b: 80 }, // 绿色
      { r: 180, g: 180, b: 220 } // 淡蓝色
    ]
  }
}

/**
 * 从图片中提取次要颜色
 * @param imageSrc 图片路径
 * @param colorCount 要提取的颜色数量
 * @returns 返回RGB颜色对象数组
 */
export async function extractSecondaryColors(
  imageSrc: string,
  colorCount: number
): Promise<Color[]> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'

    img.onload = () => {
      try {
        // 创建canvas来分析图片
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve([])
          return
        }

        // 设置canvas大小
        const size = 100
        canvas.width = size
        canvas.height = size

        // 在canvas上绘制图片
        ctx.drawImage(img, 0, 0, size, size)

        // 获取像素数据
        const imageData = ctx.getImageData(0, 0, size, size).data

        // 使用简单的颜色量化算法
        const colorBuckets: Record<string, { count: number; r: number; g: number; b: number }> = {}

        // 采样像素并分组
        for (let i = 0; i < imageData.length; i += 4) {
          // 忽略透明像素
          if (imageData[i + 3] < 128) continue

          // 量化颜色 (减少颜色空间)
          const r = Math.floor(imageData[i] / 24) * 24
          const g = Math.floor(imageData[i + 1] / 24) * 24
          const b = Math.floor(imageData[i + 2] / 24) * 24

          const key = `${r},${g},${b}`

          if (!colorBuckets[key]) {
            colorBuckets[key] = { count: 0, r, g, b }
          }

          colorBuckets[key].count++
        }

        // 将颜色桶转换为数组并按出现频率排序
        const sortedColors = Object.values(colorBuckets).sort((a, b) => b.count - a.count)

        // 选择前N个颜色，但跳过第一个（因为它可能是主色调）
        const secondaryColors: Color[] = []
        for (let i = 1; i < sortedColors.length && secondaryColors.length < colorCount; i++) {
          // 确保颜色足够不同（简单的欧几里得距离）
          let isDifferentEnough = true
          for (const existingColor of secondaryColors) {
            const distance = Math.sqrt(
              Math.pow(existingColor.r - sortedColors[i].r, 2) +
                Math.pow(existingColor.g - sortedColors[i].g, 2) +
                Math.pow(existingColor.b - sortedColors[i].b, 2)
            )

            if (distance < 60) {
              // 阈值，可以调整
              isDifferentEnough = false
              break
            }
          }

          if (isDifferentEnough) {
            secondaryColors.push({
              r: sortedColors[i].r,
              g: sortedColors[i].g,
              b: sortedColors[i].b
            })
          }
        }

        resolve(secondaryColors)
      } catch (error) {
        console.error('提取次要颜色失败:', error)
        resolve([])
      }
    }

    img.onerror = () => {
      console.error('图片加载失败:', imageSrc)
      resolve([])
    }

    img.src = imageSrc
  })
}

/**
 * 创建颜色变体
 * @param baseColor 基础颜色
 * @param index 变体索引
 * @returns 返回变体颜色
 */
function createColorVariant(baseColor: Color, index: number): Color {
  // 转换为HSL
  const { h, s, l } = rgbToHsl(baseColor.r, baseColor.g, baseColor.b)

  // 提高基础亮度，使颜色更加明亮
  let newH = h
  let newS = Math.min(s * 1.2, 1.0) // 增加饱和度
  let newL = Math.min(l * 1.3, 0.85) // 增加亮度，但不超过0.85

  switch (index % 4) {
    case 0: // 互补色 - 更明亮
      newH = (h + 0.5) % 1.0
      newL = Math.min(l * 1.4, 0.9)
      break
    case 1: // 类似色 (顺时针) - 更明亮
      newH = (h + 0.05) % 1.0
      newS = Math.min(1, s * 1.3)
      newL = Math.min(l * 1.35, 0.85)
      break
    case 2: // 类似色 (逆时针) - 更明亮
      newH = (h - 0.05 + 1.0) % 1.0
      newS = Math.min(1, s * 1.25)
      newL = Math.min(l * 1.3, 0.8)
      break
    case 3: // 三元色 - 更明亮
      newH = (h + 0.33) % 1.0
      newL = Math.min(l * 1.25, 0.75)
      break
  }

  // 转回RGB
  const rgb = hslToRgb(newH, newS, newL)
  return { r: rgb[0], g: rgb[1], b: rgb[2] }
}

/**
 * RGB转HSL
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0,
    s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }

    h /= 6
  }

  return { h, s, l }
}

/**
 * HSL转RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b

  if (s === 0) {
    r = g = b = l // 灰色
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q

    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/**
 * 从图片中提取主要颜色
 * @param imageSrc 图片路径
 * @returns 返回RGB颜色对象
 */
export async function extractDominantColor(imageSrc: string): Promise<Color> {
  return new Promise((resolve, reject) => {
    // 处理相对路径
    let actualSrc = imageSrc
    if (
      imageSrc.includes('@assets/images/Default.jpg') ||
      imageSrc.includes('@renderer/assets/images/Default.jpg')
    ) {
      actualSrc = DefaultCover
    } else if (
      imageSrc.includes('@assets/images/cover.png') ||
      imageSrc.includes('@renderer/assets/images/cover.png')
    ) {
      actualSrc = CoverImage
    }

    // 如果仍然是相对路径，使用默认封面
    if (actualSrc.startsWith('@')) {
      console.warn('无法解析相对路径，使用默认颜色')
      resolve({ r: 76, g: 116, b: 206 }) // 默认蓝色
      return
    }

    const img = new Image()
    img.crossOrigin = 'Anonymous' // 处理跨域问题

    img.onload = () => {
      try {
        // 创建canvas来分析图片
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建canvas上下文'))
          return
        }

        // 设置canvas大小为图片的缩略图大小以提高性能
        const size = 50
        canvas.width = size
        canvas.height = size

        // 在canvas上绘制图片
        ctx.drawImage(img, 0, 0, size, size)

        // 获取像素数据
        const imageData = ctx.getImageData(0, 0, size, size).data

        // 使用简单的颜色量化算法
        const colorBuckets: Record<string, { count: number; r: number; g: number; b: number }> = {}

        // 采样像素并分组
        for (let i = 0; i < imageData.length; i += 4) {
          // 忽略透明像素
          if (imageData[i + 3] < 128) continue

          // 量化颜色 (减少颜色空间)
          const r = Math.floor(imageData[i] / 32) * 32
          const g = Math.floor(imageData[i + 1] / 32) * 32
          const b = Math.floor(imageData[i + 2] / 32) * 32

          const key = `${r},${g},${b}`

          if (!colorBuckets[key]) {
            colorBuckets[key] = { count: 0, r, g, b }
          }

          colorBuckets[key].count++
        }

        // 找出出现最多的颜色
        let maxCount = 0
        let dominantColor = { r: 0, g: 0, b: 0 }

        for (const key in colorBuckets) {
          if (colorBuckets[key].count > maxCount) {
            maxCount = colorBuckets[key].count
            dominantColor = {
              r: colorBuckets[key].r,
              g: colorBuckets[key].g,
              b: colorBuckets[key].b
            }
          }
        }

        // 返回主要颜色
        resolve(dominantColor)
      } catch (error) {
        console.error('提取颜色时出错:', error)
        // 出错时使用默认颜色
        resolve({ r: 76, g: 116, b: 206 }) // 默认蓝色
      }
    }

    img.onerror = () => {
      console.error('图片加载失败:', actualSrc)
      // 加载失败时使用默认颜色
      resolve({ r: 76, g: 116, b: 206 }) // 默认蓝色
    }

    // 设置图片源
    img.src = actualSrc

    // 如果图片已经在缓存中，可能不会触发onload事件
    if (img.complete) {
      img.onload!(new Event('load'))
    }
  })
}
