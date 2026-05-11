/* 关键:不要 `import * as nsfwjs from 'nsfwjs'` —— 那会通过 default_models.js
 * 同时打入 InceptionV3 (~28MB) + MobileNetV2 (3.5MB) + MobileNetV2Mid (5.5MB)
 * 三套模型权重,即便实际只用一个,体积也会膨胀 ~33MB+。
 * 通过 nsfwjs/core + 单独的 mobilenet_v2 子入口,只把轻量模型(3.5MB)打进 bundle。 */
import { load, type NSFWJS } from 'nsfwjs/core'
import { MobileNetV2Model } from 'nsfwjs/models/mobilenet_v2'

/**
 * NSFW (Not Safe For Work) 图像检测工具类
 * 基于 nsfwjs 实现，用于在前端拦截并阻止违规图片（如色情、性感等）上传。
 */
export class NsfwCheckTool {
  private static instance: NsfwCheckTool
  private model: NSFWJS | null = null
  private isLoading: boolean = false

  // 默认的不安全类别及阈值（0到1之间，数值越小越严格）
  // Hentai: 动漫色情, Porn: 真实色情, Sexy: 性感
  private unsafeThresholds = {
    Hentai: 0.6,
    Porn: 0.6,
    Sexy: 0.8
  }

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): NsfwCheckTool {
    if (!NsfwCheckTool.instance) {
      NsfwCheckTool.instance = new NsfwCheckTool()
    }
    return NsfwCheckTool.instance
  }

  /**
   * 初始化并加载模型
   * 该过程可能较慢，建议在使用前提前调用或异步等待
   */
  public async loadModel(): Promise<void> {
    if (this.model) return
    if (this.isLoading) {
      // 如果正在加载，则等待加载完成
      while (this.isLoading) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return
    }

    try {
      this.isLoading = true
      /* 用 nsfwjs/core 的 load,显式传 modelDefinitions=[MobileNetV2Model] 覆盖
       * 默认 DEFAULT_MODELS。这样只把 3.5MB 的轻量模型权重打进 bundle,跳过
       * nsfwjs/index.js 的 default_models.js 注入的 InceptionV3 + MobileNetV2Mid。 */
      this.model = await load('MobileNetV2', { modelDefinitions: [MobileNetV2Model] })
    } catch (error) {
      console.error('NSFW 模型加载失败:', error)
      throw new Error('鉴黄模型加载失败，请检查网络环境')
    } finally {
      this.isLoading = false
    }
  }

  /**
   * 将各种格式的图片输入转换为可供模型检测的 HTMLImageElement
   * @param source File 对象, Blob 对象 或 base64/url 字符串
   * @returns 返回一个 Promise，解析为 HTMLImageElement
   */
  private async getImageElement(source: File | Blob | string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片加载失败，无法进行内容检测'))

      if (typeof source !== 'string') {
        img.src = URL.createObjectURL(source)
      } else {
        img.src = source
      }
    })
  }

  /**
   * 检测图片是否安全
   * @param imageSource File / Blob / string (URL或Base64)
   * @returns 返回布尔值：true 表示安全，false 表示可能包含违规内容
   */
  public async isSafeImage(imageSource: File | Blob | string): Promise<boolean> {
    try {
      await this.loadModel()
      if (!this.model) {
        throw new Error('模型未加载')
      }

      const imgElement = await this.getImageElement(imageSource)

      // 进行图片分类预测
      const predictions = await this.model.classify(imgElement)

      // 释放对象URL内存
      if (typeof imageSource !== 'string') {
        URL.revokeObjectURL(imgElement.src)
      }

      // 检查预测结果是否超过阈值
      for (const prediction of predictions) {
        const className = prediction.className as keyof typeof this.unsafeThresholds
        if (
          this.unsafeThresholds[className] !== undefined &&
          prediction.probability > this.unsafeThresholds[className]
        ) {
          console.warn(
            `NSFW 检测拦截: 类别 ${className}, 概率 ${(prediction.probability * 100).toFixed(2)}%`
          )
          return false
        }
      }

      return true
    } catch (error) {
      console.error('NSFW 图片检测过程中发生错误:', error)
      // 为了不影响正常业务流程，如果检测失败（例如模型加载失败），可以选择默认放行或阻止
      // 这里选择抛出异常由上层决定，或者默认返回 false (严格模式)
      throw error
    }
  }
}

// 导出一个默认的单例方法，方便直接调用
export const checkImageIsSafe = async (imageSource: File | Blob | string): Promise<boolean> => {
  const tool = NsfwCheckTool.getInstance()
  return await tool.isSafeImage(imageSource)
}
