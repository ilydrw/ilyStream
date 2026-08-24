import { describe, expect, it } from 'vitest'
import { classifyAiCommand, shouldSuppressChatTtsForCommand } from './chat-command-intent'

describe('AI command intent', () => {
  it('executes every non-empty prompt after an explicit configured prefix', () => {
    expect(classifyAiCommand('!ai is Ren cool')).toEqual({
      kind: 'ai',
      executable: true,
      command: '!ai',
      prompt: 'is Ren cool'
    })
    expect(classifyAiCommand('!AI are we live?')).toEqual({
      kind: 'ai',
      executable: true,
      command: '!ai',
      prompt: 'are we live?'
    })
  })

  it('still rejects an empty command and unrelated bang messages', () => {
    expect(classifyAiCommand('!ai')).toEqual({
      kind: 'literal',
      executable: false,
      command: '!ai',
      reason: 'missing-prompt'
    })
    expect(classifyAiCommand('!brb')).toEqual({ kind: 'none', executable: false })
  })

  it('keeps explicit AI prompts out of ordinary chat TTS', () => {
    expect(shouldSuppressChatTtsForCommand('!ai is Ren cool')).toBe(true)
    expect(shouldSuppressChatTtsForCommand('!AI is really cool')).toBe(true)
  })
})
