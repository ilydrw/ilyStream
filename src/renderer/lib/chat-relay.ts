import type {
  Platform,
  PlatformChatCapability,
  PlatformChatSendResult
} from '../../main/platforms/types'
import {
  buildRelayText as buildSharedRelayText,
  getSendablePlatforms as getSharedSendablePlatforms,
  PLATFORM_LABELS,
  type RelayTagMode
} from '../../shared/chat-relay'
import type { ChatMessage } from '../stores/chat-store'

export function getSendablePlatforms(
  capabilities: Record<Platform, PlatformChatCapability>
): Platform[] {
  return getSharedSendablePlatforms(capabilities)
}

export function getRelayTargets(
  capabilities: Record<Platform, PlatformChatCapability>,
  sourcePlatform: Platform
): Platform[] {
  return getSendablePlatforms(capabilities).filter((platform) => platform !== sourcePlatform)
}

export function buildRelayText(
  message: ChatMessage,
  tagMode: RelayTagMode = 'platform-and-user'
): string {
  return buildSharedRelayText(
    {
      platform: message.platform,
      displayName: message.displayName,
      message: message.message
    },
    tagMode
  )
}

export function summarizeSendResults(results: PlatformChatSendResult[]): {
  tone: 'success' | 'warning' | 'error'
  text: string
} {
  const succeeded = results.filter((result) => result.ok).map((result) => PLATFORM_LABELS[result.platform])
  const failed = results
    .filter((result) => !result.ok)
    .map((result) => `${PLATFORM_LABELS[result.platform]}: ${result.error || 'Unknown error'}`)

  if (succeeded.length > 0 && failed.length === 0) {
    return {
      tone: 'success',
      text: `Sent to ${succeeded.join(', ')}.`
    }
  }

  if (succeeded.length > 0) {
    return {
      tone: 'warning',
      text: `Sent to ${succeeded.join(', ')}. Failed: ${failed.join(' | ')}`
    }
  }

  return {
    tone: 'error',
    text: failed.length > 0 ? failed.join(' | ') : 'No platforms were selected.'
  }
}
