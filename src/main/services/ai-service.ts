import { ChatDeepSeek } from '@langchain/deepseek'

class AIService {
  private readonly llm: ChatDeepSeek
  constructor() {
    this.llm = new ChatDeepSeek({
      apiKey: 'sk-038eed34fd8f414e8130733152227480',
      model: 'deepseek-chat',
      temperature: 0.7
    })
  }
  async askChat(prompt: string) {
    const res = await this.llm.invoke([
      {
        role: 'system',
        content: '你是一个专业的音乐助手,你可以回答音乐相关的问题,也可以推荐音乐'
      },
      {
        role: 'user',
        content: prompt
      }
    ])
    return res
  }
}

export { AIService }
