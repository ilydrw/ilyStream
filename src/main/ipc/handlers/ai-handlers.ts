import { ipcMain } from 'electron'
import { AIService } from '../../ai/ai-service'
import { StreamIntelligenceService } from '../../ai/stream-intelligence-service'

export function registerAIHandlers(aiService: AIService, streamIntelligenceService: StreamIntelligenceService): void {
  ipcMain.handle('ai:generate-response', async (_event, message: string, context: { username: string; platform: string }) => {
    return await aiService.generateResponse(message, context)
  })

  ipcMain.handle('ai:get-stream-insights', () => {
    return streamIntelligenceService.getInsights()
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
