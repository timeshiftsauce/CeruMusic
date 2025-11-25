import DefaultCover from '@renderer/assets/images/Default.jpg'
import CoverImage from '@renderer/assets/images/cover.png'

/**
 * 直接从图片分析平均亮度，不依赖颜色提取器
 * @param imageSrc 图片路径
 * @returns 返回平均亮度值 (0-1)
 */
async function getImageAverageLuminance(imageSrc: string): Promise<number> {
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

    // 如果仍然是相对路径，使用默认亮度
    if (actualSrc.startsWith('@')) {
      console.warn('无法解析相对路径，使用默认亮度')
      resolve(0.5) // 中等亮度
      return
    }

    const img = new Image()
    img.crossOrigin = 'Anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建canvas上下文'))
          return
        }

        // 使用较小的采样尺寸提高性能
        const size = 50
        canvas.width = size
        canvas.height = size

        ctx.drawImage(img, 0, 0, size, size)
        const imageData = ctx.getImageData(0, 0, size, size).data

        let totalLuminance = 0
        let pixelCount = 0

        // 计算所有非透明像素的平均亮度
        for (let i = 0; i < imageData.length; i += 4) {
          // 忽略透明像素
          if (imageData[i + 3] < 128) continue

          const r = imageData[i] / 255
          const g = imageData[i + 1] / 255
          const b = imageData[i + 2] / 255

          // 使用WCAG 2.0相对亮度公式
          const R = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
          const G = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
          const B = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

          const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B
          totalLuminance += luminance
          pixelCount++
        }

        const averageLuminance = pixelCount > 0 ? totalLuminance / pixelCount : 0.5
        resolve(averageLuminance)
      } catch (error) {
        console.error('分析图片亮度失败:', error)
        resolve(0.5) // 默认中等亮度
      }
    }

    img.onerror = () => {
      console.error('图片加载失败:', actualSrc)
      resolve(0.5) // 默认中等亮度
    }

    img.src = actualSrc
  })
}

/**
 * 判断图片应该使用黑色还是白色作为对比色
 * @param imageSrc 图片路径
 * @returns 返回布尔值，true表示应该使用黑色，false表示应该使用白色
 */
export async function shouldUseBlackText(imageSrc: string): Promise<boolean> {
  try {
    // 直接分析图片的平均亮度
    const averageLuminance = await getImageAverageLuminance(imageSrc)

    console.log(
      `图片: ${imageSrc.slice(-20)}, ` +
      `平均亮度: ${averageLuminance.toFixed(3)} ` +
      `(考虑半透明黑色背景覆盖效果)`
    )

    // 考虑到图片会受到rgba(0, 0, 0, 0.256)背景覆盖，实际显示会更暗
    // 大幅提高阈值，让白色文字在更多情况下被选择
    // 只有非常明亮的图片才使用黑色文字

    const shouldUseBlack = averageLuminance >= 0.6

    console.log(`决定使用${shouldUseBlack ? '黑色' : '白色'}文字`)

    return shouldUseBlack
  } catch (error) {
    console.error('计算对比色失败:', error)
    // 默认返回白色作为安全选择
    return false
  }
}

/**
 * 获取与图片最佳对比的文本颜色
 * @param imageSrc 图片路径
 * @returns 返回十六进制颜色代码
 */
export async function getBestContrastTextColor(imageSrc: string): Promise<string> {
  const useBlack = await shouldUseBlackText(imageSrc)
  return useBlack ? '#000000' : '#FFFFFF'
}

/**
 * 获取与图片最佳对比的文本颜色（带透明度）
 * @param imageSrc 图片路径
 * @param opacity 透明度 (0-1)
 * @returns 返回rgba颜色字符串
 */
export async function getBestContrastTextColorWithOpacity(
  imageSrc: string,
  opacity: number = 1
): Promise<string> {
  try {
    // 使用相同的亮度分析逻辑
    const averageLuminance = await getImageAverageLuminance(imageSrc)

    // 使用与shouldUseBlackText相同的逻辑
    if (averageLuminance >= 0.6) {
      // 背景较亮，使用黑色文本
      return `rgba(0, 0, 0, ${opacity})`
    } else {
      // 背景较暗，使用白色文本
      return `rgba(255, 255, 255, ${opacity})`
    }
  } catch (error) {
    console.error('获取对比文本颜色失败:', error)
    // 默认返回白色文本
    return `rgba(255, 255, 255, ${opacity})`
  }
}
