import { platformNames } from '../../../lib/audience-labels'
import type { ChatMessage } from '../../../stores/chat-store'

export function formatEmoteFallback(name: string, platform: ChatMessage['platform']): string {
  const label = name.trim().replace(/^:+|:+$/g, '').trim()
  if (platform === 'tiktok' && (!label || /^\d+$/.test(label) || label === 'emote')) {
    return '[TikTok Fan Club emote]'
  }
  return label && !/^\d+$/.test(label) && label !== 'emote'
    ? `:${label}:`
    : `[${platformNames[platform]} emote]`
}
