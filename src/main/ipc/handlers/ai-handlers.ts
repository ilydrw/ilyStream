import { ipcMain } from 'electron'
import { AIService } from '../../ai/ai-service'

export function registerAIHandlers(aiService: AIService): void {
  ipcMain.handle('ai:generate-response', async (_event, message: string, context: { username: string; platform: string }) => {
    return await aiService.generateResponse(message, context)
  })

  ipcMain.handle('ai:test-connection', async () => {
    try {
      await aiService.generateResponse('Hello, testing connection.', { username: 'test-user', platform: 'test' })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
