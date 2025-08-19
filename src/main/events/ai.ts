import { AIService } from '../services/ai-service'
import { ipcMain } from 'electron'
// 创建AI服务实例
export default function aiEvents(mainWindow) {
  const aiService = new AIService()

  // 注册AI服务的IPC处理器
  ipcMain.handle('ai-ask', async (_, prompt) => {
    try {
      return await aiService.askChat(prompt)
    } catch (error: any) {
      console.error('AI对话失败:', error)
      // 返回错误信息给渲染进程
      throw {
        message: (error as Error).message || 'AI服务暂时不可用',
        code: 'AI_SERVICE_ERROR'
      }
    }
  })

  // 注册AI流式服务的IPC处理器
  ipcMain.handle('ai-ask-stream', async (event, prompt, streamId) => {
    try {
      const stream = aiService.askChatStream(prompt)

      for await (const chunk of stream) {
        // 发送流式数据块到渲染进程
        event.sender.send('ai-stream-chunk', { streamId, chunk })
      }

      // 发送流结束信号
      event.sender.send('ai-stream-end', { streamId })
      return { success: true }
    } catch (error: any) {
      console.error('AI流式对话失败:', error)
      // 发送错误信号，包含更详细的错误信息
      const errorMessage = (error as Error).message || 'AI服务暂时不可用'
      event.sender.send('ai-stream-error', {
        streamId,
        error: errorMessage,
        code: 'AI_SERVICE_ERROR'
      })
      throw {
        message: errorMessage,
        code: 'AI_SERVICE_ERROR'
      }
    }
  })

  // 注册获取用户配置的IPC处理器
  ipcMain.handle('get-user-config', async () => {
    try {
      // 从渲染进程的localStorage获取用户配置
      const result = await mainWindow?.webContents.executeJavaScript(`
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
      return result
    } catch (error) {
      console.error('获取用户配置失败:', error)
      return null
    }
  })
}
