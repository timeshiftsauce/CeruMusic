import { ChatDeepSeek } from '@langchain/deepseek'
import { BrowserWindow } from 'electron'

class AIService {
  private chatModel: ChatDeepSeek | null = null

  constructor() {
    // 构造函数中不再初始化chatModel，改为在使用时动态获取
  }

  private async initChatModel(): Promise<ChatDeepSeek> {
    if (this.chatModel) {
      return this.chatModel
    }

    try {
      // 直接从主窗口获取用户配置
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

      const apiKey = userConfig?.deepseekAPIkey

      if (!apiKey) {
        throw new Error('DeepSeek API Key 未配置，请在设置页面配置后再使用AI功能')
      }

      this.chatModel = new ChatDeepSeek({
        apiKey: apiKey,
        model: 'deepseek-chat'
      })

      return this.chatModel
    } catch (error) {
      console.error('初始化AI服务失败:', error)
      throw error
    }
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
