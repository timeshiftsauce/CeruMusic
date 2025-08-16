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

    // 计算颜色的亮度 (使用相对亮度公式: 0.299*R + 0.587*G + 0.114*B)
    // 这个公式考虑了人眼对不同颜色的敏感度
    const luminance =
      (0.299 * dominantColor.r + 0.587 * dominantColor.g + 0.114 * dominantColor.b) / 255

    // 计算与黑色和白色的对比度
    // 对比度计算公式: (L1 + 0.05) / (L2 + 0.05)，其中L1是较亮的颜色，L2是较暗的颜色
    const contrastWithBlack = (luminance + 0.05) / 0.05
    const contrastWithWhite = 1.05 / (luminance + 0.05)

    // 根据WCAG 2.0标准，对比度至少应为4.5:1以确保良好的可读性
    // 我们选择对比度更高的颜色
    console.log(
      `颜色亮度: ${luminance}, 与黑色对比度: ${contrastWithBlack}, 与白色对比度: ${contrastWithWhite}`
    )

    // 返回应该使用的文本颜色: true为黑色，false为白色
    return contrastWithWhite > contrastWithBlack
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
  const useBlack = await shouldUseBlackText(imageSrc)
  return useBlack ? `rgba(0, 0, 0, ${opacity})` : `rgba(255, 255, 255, ${opacity})`
}
