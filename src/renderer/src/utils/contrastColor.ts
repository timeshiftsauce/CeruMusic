import { extractDominantColor } from './colorExtractor'

/**
 * 判断图片应该使用黑色还是白色作为对比色
 * @param imageSrc 图片路径
 * @returns 返回布尔值，true表示应该使用黑色，false表示应该使用白色
 */
export async function shouldUseBlackText(imageSrc: string): Promise<boolean> {
  try {
    // 提取主要颜色
    const dominantColor = await extractDominantColor(imageSrc)

    // 使用更准确的相对亮度计算公式 (sRGB相对亮度)
    // 先将RGB值标准化到0-1范围
    const r = dominantColor.r / 255
    const g = dominantColor.g / 255
    const b = dominantColor.b / 255

    // 应用sRGB转换
    const R = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
    const G = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
    const B = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

    // 计算相对亮度 (WCAG 2.0公式)
    const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B

    // 计算与黑色和白色的对比度
    // 对比度计算公式: (L1 + 0.05) / (L2 + 0.05)，其中L1是较亮的颜色，L2是较暗的颜色
    const contrastWithBlack = (luminance + 0.05) / 0.05
    const contrastWithWhite = 1.05 / (luminance + 0.05)

    console.log(
      `颜色: RGB(${dominantColor.r},${dominantColor.g},${dominantColor.b}), ` +
        `亮度: ${luminance.toFixed(3)}, ` +
        `与黑色对比度: ${contrastWithBlack.toFixed(2)}, ` +
        `与白色对比度: ${contrastWithWhite.toFixed(2)}`
    )

    // 不仅考虑亮度，还要考虑对比度
    // 如果与黑色的对比度更高，说明背景较亮，应该使用黑色文字
    // 如果与白色的对比度更高，说明背景较暗，应该使用白色文字
    // 但对于中等亮度的颜色，我们需要更精细的判断

    // 对于中等亮度的颜色(0.3-0.6)，我们更倾向于使用黑色文本，因为黑色文本通常更易读
    if (luminance > 0.3) {
      return true // 使用黑色文本
    } else {
      return false // 使用白色文本
    }
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
    // 提取主要颜色
    const dominantColor = await extractDominantColor(imageSrc)

    // 使用更准确的相对亮度计算公式 (sRGB相对亮度)
    const r = dominantColor.r / 255
    const g = dominantColor.g / 255
    const b = dominantColor.b / 255

    // 应用sRGB转换
    const R = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
    const G = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
    const B = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

    // 计算相对亮度
    const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B

    // 根据亮度决定文本颜色，使用更低的阈值
    if (luminance > 0.3) {
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
