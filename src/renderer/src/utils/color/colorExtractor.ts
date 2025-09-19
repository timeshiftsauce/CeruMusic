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
        // 增加采样尺寸以获取更准确的颜色
        const size = 100
        canvas.width = size
        canvas.height = size

        // 在canvas上绘制图片
        ctx.drawImage(img, 0, 0, size, size)

        // 获取像素数据
        const imageData = ctx.getImageData(0, 0, size, size).data

        // 使用改进的颜色提取算法
        // 1. 收集所有非透明像素的颜色
        const colors: Color[] = []
        for (let i = 0; i < imageData.length; i += 4) {
          // 忽略透明像素
          if (imageData[i + 3] < 128) continue

          colors.push({
            r: imageData[i],
            g: imageData[i + 1],
            b: imageData[i + 2]
          })
        }

        // 2. 使用K-means聚类算法找出主要颜色
        const k = 5 // 聚类数量
        const dominantColors = kMeansCluster(colors, k)

        // 3. 过滤掉接近黑色和白色的颜色
        const filteredColors = dominantColors.filter((color) => {
          // 排除接近黑色的颜色
          if (color.r < 30 && color.g < 30 && color.b < 30) return false

          // 排除接近白色的颜色
          if (color.r > 225 && color.g > 225 && color.b > 225) return false

          return true
        })

        // 4. 如果过滤后没有颜色，使用最大的聚类
        let dominantColor: Color
        if (filteredColors.length > 0) {
          // 选择饱和度最高的颜色
          dominantColor = getMostSaturatedColor(filteredColors)
        } else {
          // 如果所有颜色都被过滤掉了，使用最大的聚类
          dominantColor = dominantColors[0]
        }

        // 5. 增强颜色的饱和度和亮度，使其更加鲜明
        const enhancedColor = enhanceColor(dominantColor)

        // 返回增强后的主要颜色
        resolve(enhancedColor)
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

/**
 * 使用K-means聚类算法对颜色进行聚类
 * @param colors 颜色数组
 * @param k 聚类数量
 * @returns 按大小排序的聚类中心
 */
function kMeansCluster(colors: Color[], k: number): Color[] {
  // 如果颜色数量少于k，直接返回所有颜色
  if (colors.length <= k) return colors

  // 随机选择k个初始中心点
  const centroids: Color[] = []
  const usedIndices = new Set<number>()

  while (centroids.length < k) {
    const randomIndex = Math.floor(Math.random() * colors.length)
    if (!usedIndices.has(randomIndex)) {
      usedIndices.add(randomIndex)
      centroids.push({ ...colors[randomIndex] })
    }
  }

  // 最大迭代次数
  const maxIterations = 10
  // 聚类
  const clusters: Color[][] = Array(k)
    .fill(0)
    .map(() => [])

  // 迭代优化聚类
  for (let iter = 0; iter < maxIterations; iter++) {
    // 清空聚类
    clusters.forEach((cluster) => (cluster.length = 0))

    // 将每个颜色分配到最近的中心点
    for (const color of colors) {
      let minDistance = Infinity
      let closestCentroidIndex = 0

      for (let i = 0; i < centroids.length; i++) {
        const distance = colorDistance(color, centroids[i])
        if (distance < minDistance) {
          minDistance = distance
          closestCentroidIndex = i
        }
      }

      clusters[closestCentroidIndex].push(color)
    }

    // 更新中心点
    let changed = false
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue

      const newCentroid = calculateCentroid(clusters[i])
      if (!colorEquals(newCentroid, centroids[i])) {
        centroids[i] = newCentroid
        changed = true
      }
    }

    // 如果中心点不再变化，提前结束迭代
    if (!changed) break
  }

  // 计算每个聚类的大小
  const clusterSizes = clusters.map((cluster) => cluster.length)

  // 按聚类大小排序中心点
  return centroids
    .map((centroid, i) => ({ centroid, size: clusterSizes[i] }))
    .sort((a, b) => b.size - a.size)
    .map((item) => item.centroid)
}

/**
 * 计算两个颜色之间的欧几里得距离
 */
function colorDistance(color1: Color, color2: Color): number {
  return Math.sqrt(
    Math.pow(color1.r - color2.r, 2) +
      Math.pow(color1.g - color2.g, 2) +
      Math.pow(color1.b - color2.b, 2)
  )
}

/**
 * 判断两个颜色是否相等
 */
function colorEquals(color1: Color, color2: Color): boolean {
  return color1.r === color2.r && color1.g === color2.g && color1.b === color2.b
}

/**
 * 计算一组颜色的中心点
 */
function calculateCentroid(colors: Color[]): Color {
  if (colors.length === 0) return { r: 0, g: 0, b: 0 }

  let sumR = 0,
    sumG = 0,
    sumB = 0
  for (const color of colors) {
    sumR += color.r
    sumG += color.g
    sumB += color.b
  }

  return {
    r: Math.round(sumR / colors.length),
    g: Math.round(sumG / colors.length),
    b: Math.round(sumB / colors.length)
  }
}

/**
 * 获取一组颜色中饱和度最高的颜色
 */
function getMostSaturatedColor(colors: Color[]): Color {
  let maxSaturation = -1
  let mostSaturatedColor = colors[0]

  for (const color of colors) {
    const { s } = rgbToHsl(color.r, color.g, color.b)
    if (s > maxSaturation) {
      maxSaturation = s
      mostSaturatedColor = color
    }
  }

  return mostSaturatedColor
}

/**
 * 增强颜色的饱和度和亮度
 */
function enhanceColor(color: Color): Color {
  // 转换为HSL
  const { h, s, l } = rgbToHsl(color.r, color.g, color.b)

  // 增强饱和度，但保持在合理范围内
  const enhancedS = Math.min(s * 1.2, 0.9)

  // 调整亮度，使其不会太暗或太亮
  const enhancedL = l < 0.3 ? Math.min(l * 1.5, 0.5) : l > 0.7 ? Math.max(l * 0.8, 0.5) : l

  // 转回RGB
  const rgb = hslToRgb(h, enhancedS, enhancedL)
  return { r: rgb[0], g: rgb[1], b: rgb[2] }
}
