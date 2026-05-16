import { ipcMain } from 'electron'
import { PlatformManager } from '../../platforms/platform-manager'
import { Database } from '../../db/database'
import { ChatRelayService } from '../../chat/chat-relay-service'
import { restoreEnabledPlatformConnections } from '../../platforms/platform-persistence'
import { AnyPlatformConfig, Platform } from '../../platforms/types'
import { randomUUID } from 'crypto'
import { AnyStreamEvent, UserInfo } from '../../platforms/types'
import type { AlertRuleEventType } from '../../../shared/alert-rules'
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
    (_event, payload: { platform?: Platform; type: AlertRuleEventType | 'superfan'; suppressSound?: boolean }) => {
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
  type: AlertRuleEventType | 'superfan'
  suppressSound?: boolean
}): AnyStreamEvent {
  const platform = resolveSimulationPlatform(payload.platform)
  const user = createSimulatedUser()
  const raw = { simulated: true, suppressEventSound: payload.suppressSound === true }

  if (payload.type === 'gift') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'gift',
      raw,
      user,
      giftName: 'Test Rose',
      giftId: 'test-rose',
      giftImageUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/7060293123849551105~tplv-obj.png',
      giftCount: 1,
      monetaryValue: 1,
      isCombo: false
    }
  }

  if (payload.type === 'superfan') {
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
      months: 1,
      isGift: false
    }
  }

  if (payload.type === 'subscription') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'subscription',
      raw,
      user: { ...user, isSubscriber: true },
      tier: platform === 'youtube' ? 'Member' : platform === 'twitch' ? 'Tier 1' : 'Subscriber',
      months: 3,
      isGift: false,
      monetaryValue: 499
    }
  }

  if (payload.type === 'raid') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'raid',
      raw,
      user,
      viewerCount: 24
    }
  }

  if (payload.type === 'like') {
    return {
      id: randomUUID(),
      platform,
      timestamp: new Date(),
      type: 'like',
      raw,
      user,
      likeCount: 25,
      totalLikes: 2500
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
      message: 'This is a local alert test message',
      emotes: []
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

function createSimulatedUser(): UserInfo {
  return {
    id: 'local-alert-test',
    username: 'local_alert_test',
    displayName: 'Local Alert Test',
    isModerator: false,
    isSubscriber: false,
    isVip: false,
    isFollower: true,
    badges: [],
    profilePictureUrl: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/7060293123849551105~tplv-obj.png'
  }
}

function resolveSimulationPlatform(platform: Platform | undefined): Platform {
  return platform === 'twitch' || platform === 'youtube' || platform === 'kick' ? platform : 'tiktok'
}
