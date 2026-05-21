import { ipcMain } from 'electron'
import { PlatformManager } from '../../platforms/platform-manager'
import { Database } from '../../db/database'
import { ChatRelayService } from '../../chat/chat-relay-service'
import { restoreEnabledPlatformConnections } from '../../platforms/platform-persistence'
import { AnyPlatformConfig, Platform } from '../../platforms/types'
import { randomUUID } from 'crypto'
import { AnyStreamEvent, UserInfo } from '../../platforms/types'
import type { EventLabSimulationPayload } from '../../../shared/event-lab'
import { TikTokChatSender } from '../../platforms/tiktok/tiktok-chat-sender'

let hasRestoredPlatformConnections = false

export function registerPlatformHandlers(
  platformManager: PlatformManager,
  chatRelayService: ChatRelayService,
  db: Database,
  tiktokChatSender: TikTokChatSender
) {
  ipcMain.handle('platform:connect', async (_event, config: AnyPlatformConfig) => {
    await platformManager.connect(config)
    db.savePlatformConfig(config)
  })

  ipcMain.handle('platform:disconnect', async (_event, platform: Platform) => {
    await platformManager.disconnect(platform)
    db.setPlatformEnabled(platform, false)
  })

  ipcMain.handle('platform:get-statuses', () => {
    return platformManager.getAllStatuses()
  })

  ipcMain.handle('platform:get-errors', () => {
    return platformManager.getAllErrors()
  })

  ipcMain.handle('platform:get-configs', () => {
    return db.getAllPlatformConfigs()
  })

  ipcMain.handle('platform:get-chat-capabilities', () => {
    return platformManager.getChatCapabilities()
  })

  ipcMain.handle(
    'event:simulate',
    (_event, payload: EventLabSimulationPayload) => {
      const simulatedEvent = createSimulatedEvent(payload)
      platformManager.emitTestEvent(simulatedEvent)
      return simulatedEvent
    }
  )

  ipcMain.handle(
    'platform:send-chat-message',
    async (_event, payload: { platforms: Platform[]; text: string }) => {
      const text = payload.text.trim()
      if (text.length === 0) {
        throw new Error('Cannot send an empty chat message')
      }

      const platforms = Array.from(new Set(payload.platforms))
      return chatRelayService.sendManualMessage(platforms, text)
    }
  )

  ipcMain.handle('platform:restore-connections', async () => {
    if (hasRestoredPlatformConnections) return

    hasRestoredPlatformConnections = true
    await restoreEnabledPlatformConnections(platformManager, db.getAllPlatformConfigs())
  })

  // --- TikTok Gift DB ---

  ipcMain.handle('tiktok:get-gifts', () => {
    return db.getAllTikTokGifts()
  })

  ipcMain.handle('tiktok:save-gift', (_event, gift) => {
    db.saveTikTokGift(gift)
  })

  ipcMain.handle('tiktok:fix-stats', () => {
    db.fixTikTokStats()
  })

  ipcMain.handle('tiktok:open-sender', async () => {
    await tiktokChatSender.openWindow()
  })

  ipcMain.handle('tiktok:close-sender', () => {
    tiktokChatSender.closeWindow()
  })

  ipcMain.handle('tiktok:get-sender-status', () => {
    return tiktokChatSender.getStatus()
  })
}

function createSimulatedEvent(payload: {
  platform?: Platform
  type: EventLabSimulationPayload['type']
  username?: string
  displayName?: string
  message?: string
  giftName?: string
  giftId?: string
  giftCount?: number
  likeCount?: number
  totalLikes?: number
  viewerCount?: number
  months?: number
  suppressSound?: boolean
}): AnyStreamEvent {
  const platform = resolveSimulationPlatform(payload.platform)
  const user = createSimulatedUser(payload)
  const raw = { simulated: true, suppressEventSound: payload.suppressSound === true }

  if (payload.type === 'gift') {
    const giftName = cleanText(payload.giftName, 'Test Rose', 80)
    const giftCount = clampInteger(payload.giftCount, 1, 999, 1)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'gift',
      raw,
      user,
      giftName,
      giftId: cleanText(payload.giftId, giftName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), 80),
      giftImageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/7060293123849551105~tplv-obj.png',
      giftCount,
      monetaryValue: giftCount,
      isCombo: false
    }
  }

  if (payload.type === 'superfan') {
    const months = clampInteger(payload.months, 1, 120, 1)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'subscription',
      raw,
      user: {
        ...user,
        isSubscriber: true,
        isFanClubMember: true,
        badges: [{ id: 'superfan', name: 'Superfan' }]
      },
      tier: 'Superfan',
      months,
      isGift: false,
      monetaryValue: 499
    }
  }

  if (payload.type === 'subscription') {
    const months = clampInteger(payload.months, 1, 120, 3)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'subscription',
      raw,
      user: { ...user, isSubscriber: true },
      tier: platform === 'youtube' ? 'Member' : platform === 'twitch' ? 'Tier 1' : 'Subscriber',
      months,
      isGift: false,
      monetaryValue: 499
    }
  }

  if (payload.type === 'raid') {
    const viewerCount = clampInteger(payload.viewerCount, 1, 50000, 24)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'raid',
      raw,
      user,
      viewerCount
    }
  }

  if (payload.type === 'like') {
    const likeCount = clampInteger(payload.likeCount, 1, 100000, 25)
    const totalLikes = clampInteger(payload.totalLikes, 0, 100000000, 2500)
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'like',
      raw,
      user,
      likeCount,
      totalLikes
    }
  }

  if (payload.type === 'share') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'share',
      raw,
      user
    }
  }

  if (payload.type === 'join') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'join',
      raw,
      user: { ...user, isFanClubMember: true }
    }
  }

  if (payload.type === 'chat') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'chat',
      raw,
      user,
      message: cleanText(payload.message, 'This is a local alert test message', 500),
      emotes: []
    }
  }

  if (payload.type === 'viewer-count') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'viewer-count',
      raw,
      count: clampInteger(payload.viewerCount, 0, 50000, 24)
    }
  }

  return {
    id: randomUUID(),
    platform,
    timestamp: new Date(),
    type: 'follow',
    raw,
    user
  }
}

function createSimulatedUser(payload: Pick<EventLabSimulationPayload, 'username' | 'displayName'> = {}): UserInfo {
  const username = cleanText(payload.username, 'local_alert_test', 48).replace(/\s+/g, '_')
  const displayName = cleanText(payload.displayName, payload.username || 'Local Alert Test', 64)

  return {
    id: 'local-alert-test',
    username,
    displayName,
    isModerator: false,
    isSubscriber: false,
    isVip: false,
    isFollower: true,
    badges: [],
    profilePictureUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/7060293123849551105~tplv-obj.png'
  }
}

function resolveSimulationPlatform(platform: Platform | undefined): Platform {
  const allowed = new Set<Platform>([
    'tiktok',
    'twitch',
    'youtube',
    'kick',
    'x',
    'discord',
    'facebook',
    'instagram',
    'restream',
    'linkedin',
    'telegram'
  ])
  return platform && allowed.has(platform) ? platform : 'tiktok'
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const text = String(value ?? '').trim()
  return (text || fallback).slice(0, maxLength)
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numericValue = Math.floor(Number(value))
  if (!Number.isFinite(numericValue)) return fallback
  return Math.min(max, Math.max(min, numericValue))
}
