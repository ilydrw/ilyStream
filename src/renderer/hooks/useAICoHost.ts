import { useEffect, useRef } from 'react'
import { useChatStore, type ChatMessage } from '../stores/chat-store'
import { resolveAppSettings, type AppSettings } from '../../shared/app-settings'

export function useAICoHost() {
  const messages = useChatStore((s) => s.messages)
  const addMessage = useChatStore((s) => s.addMessage)
  const lastProcessedId = useRef<string | null>(null)
  const aiTimer = useRef<NodeJS.Timeout | null>(null)
  const settingsRef = useRef<AppSettings | null>(null)

  useEffect(() => {
    if (!window.api?.settings) return

    window.api.settings.getAll().then((s: any) => {
      settingsRef.current = resolveAppSettings(s)
    })

    const unsubscribe = window.api.on('settings:changed', (s: any) => {
      settingsRef.current = resolveAppSettings(s)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!window.api?.ai) return
    if (messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.id === lastProcessedId.current) return
    lastProcessedId.current = lastMsg.id

    // Don't process AI's own messages
    if ((lastMsg as any).isAI) return

    // Clear any pending AI timer whenever a human responds
    if (aiTimer.current) {
      clearTimeout(aiTimer.current)
      aiTimer.current = null
    }

    if (!settingsRef.current?.aiEnabled) return

    const text = lastMsg.message.toLowerCase()
    const isQuestion = text.includes('?') || 
                      text.startsWith('what') || 
                      text.startsWith('how') || 
                      text.startsWith('why') || 
                      text.startsWith('who')

    if (isQuestion) {
      // Debounce: Wait 12 seconds for a human response
      aiTimer.current = setTimeout(async () => {
        try {
          const response = await window.api.ai.generateResponse(lastMsg.message, {
            username: lastMsg.displayName,
            platform: lastMsg.platform
          })

          const aiMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            platform: lastMsg.platform,
            username: 'ilyStreamAI',
            displayName: 'ilyStream AI 🤖',
            message: response,
            isModerator: true,
            isSubscriber: false,
            timestamp: new Date(),
            profilePictureUrl: 'asset:app-icon.png'
          }
          ;(aiMsg as any).isAI = true

          addMessage(aiMsg)

          // TTS Integration
          if (settingsRef.current?.ttsEnabled) {
             // We can trigger TTS for the AI message
             window.api.tts.testSpeak({
               text: response,
               voiceProfileId: settingsRef.current.ttsChatVoiceProfileId // Use default chat voice
             })
          }
        } catch (err) {
          console.error('AI Co-host failed:', err)
        }
      }, 12000)
    }
  }, [messages, addMessage])
}
