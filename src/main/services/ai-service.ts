import { ChatDeepSeek } from '@langchain/deepseek'
import { ChatOpenAI } from '@langchain/openai'
import { BrowserWindow } from 'electron'

export type AIProvider = 'deepseek' | 'openai' | 'siliconflow' | 'custom'

export interface AIConfig {
  provider?: AIProvider
  apiKey?: string
  baseURL?: string
  model?: string
}

const PROVIDER_CONFIGS: Record<
  AIProvider,
  { defaultBaseURL: string; defaultModel: string; label: string }
> = {
  deepseek: {
    defaultBaseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    label: 'DeepSeek'
  },
  openai: {
    defaultBaseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    label: 'OpenAI'
  },
  siliconflow: {
    defaultBaseURL: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    label: '硅基流动'
  },
  custom: {
    defaultBaseURL: '',
    defaultModel: '',
    label: '自定义'
  }
}

class AIService {
  private chatModel: ChatDeepSeek | ChatOpenAI | null = null
  private currentConfig: AIConfig | null = null

  private async getAIConfig(): Promise<AIConfig> {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (!mainWindow) {
      throw new Error('主窗口未找到')
    }

    const userConfig = await mainWindow.webContents.executeJavaScript(`
      (() => {
        try {
          const userInfo = localStorage.getItem('userInfo');
          return userInfo ? JSON.parse(userInfo) : null;
        } catch (error) {
          console.error('获取用户配置失败:', error);
          return null;
        }
      })()
    `)

    // 兼容旧版配置：如果存在 deepseekAPIkey，自动迁移到 aiConfig
    const legacyKey = userConfig?.deepseekAPIkey
    if (legacyKey && !userConfig?.aiConfig?.apiKey) {
      const migrated: AIConfig = {
        provider: 'deepseek',
        apiKey: legacyKey,
        baseURL: PROVIDER_CONFIGS.deepseek.defaultBaseURL,
        model: PROVIDER_CONFIGS.deepseek.defaultModel
      }
      // 异步迁移，不阻塞当前调用
      mainWindow.webContents
        .executeJavaScript(
          `
        (() => {
          try {
            const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
            userInfo.aiConfig = ${JSON.stringify(migrated)};
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
          } catch (e) {}
        })()
      `
        )
        .catch(() => {})
      return migrated
    }

    return userConfig?.aiConfig || {}
  }

  private async initChatModel(): Promise<ChatDeepSeek | ChatOpenAI> {
    const config = await this.getAIConfig()

    if (!config.apiKey) {
      throw new Error('AI API Key 未配置，请在设置页面配置后再使用AI功能')
    }

    // 如果配置没有变化，复用已有实例
    if (
      this.chatModel &&
      this.currentConfig &&
      this.currentConfig.provider === config.provider &&
      this.currentConfig.apiKey === config.apiKey &&
      this.currentConfig.baseURL === config.baseURL &&
      this.currentConfig.model === config.model
    ) {
      return this.chatModel
    }

    const provider = config.provider || 'deepseek'
    const providerCfg = PROVIDER_CONFIGS[provider]
    const baseURL = config.baseURL || providerCfg.defaultBaseURL
    const model = config.model || providerCfg.defaultModel

    if (provider === 'deepseek') {
      this.chatModel = new ChatDeepSeek({
        apiKey: config.apiKey,
        model: model,
        configuration: baseURL ? { baseURL } : undefined
      })
    } else {
      // openai, siliconflow, custom 都使用 ChatOpenAI（OpenAI 兼容接口）
      this.chatModel = new ChatOpenAI({
        apiKey: config.apiKey,
        model: model,
        configuration: baseURL ? { baseURL } : undefined
      })
    }

    this.currentConfig = { ...config }
    return this.chatModel
  }

  async *askChatStream(prompt: string) {
    try {
      const chatModel = await this.initChatModel()
      const stream = await chatModel.stream([
        {
          role: 'system',
          content:
            '你是Ceru Musice AI助手,你熟知古今中外的各种流行音乐和音乐人。你可以为用户推荐音乐、解答音乐相关问题、分析歌曲含义和音乐理论知识。请用友善、专业的语气与用户交流，帮助他们探索音乐的魅力。'
        },
        {
          role: 'user',
          content: prompt
        }
      ])
      for await (const chunk of stream) {
        yield chunk.content
      }
    } catch (error) {
      console.error('AI流式对话失败:', error)
      throw error
    }
  }

  async askChat(prompt: string): Promise<string> {
    try {
      const chatModel = await this.initChatModel()
      const response = await chatModel.invoke(prompt)
      return response.content as string
    } catch (error) {
      console.error('AI对话失败:', error)
      throw error
    }
  }
}

export { AIService }
export { PROVIDER_CONFIGS }
