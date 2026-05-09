import { ipcMain } from 'electron'
import { OverlayServer } from '../../overlay/overlay-server'
import { EventOrchestrator } from '../../services/event-orchestrator'

export function registerOverlayHandlers(
  overlayServer: OverlayServer,
  eventOrchestrator: EventOrchestrator
) {
  ipcMain.handle('overlay:get-status', () => overlayServer.getStatus())
  ipcMain.handle('overlay:get-goal-state', () => overlayServer.getGoalState())
  
  ipcMain.handle('overlay:send-deck-action', (_event, action: { type: string; payload: any }) => {
    // We reuse the deck action logic from EventOrchestrator
    // but trigger it from the local Electron UI
    eventOrchestrator.handleDeckAction(action)
  })

  ipcMain.handle('overlay:send-feature-message', (_event, payload: any) => {
    overlayServer.broadcastFeatureMessage(payload)
  })

  ipcMain.handle('overlay:send-relay-message', (_event, payload: any) => {
    overlayServer.broadcastRelayMessage(payload)
  })

  ipcMain.on('overlay:notify-speech-state', (_event, isSpeaking: boolean, isAI: boolean) => {
    overlayServer.broadcastSpeechState(isSpeaking, isAI)
  })
}
