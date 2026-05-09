import { ipcMain } from 'electron'
import { PlatformManager } from '../../platforms/platform-manager'
import { Database } from '../../db/database'
import { ChatRelayService } from '../../chat/chat-relay-service'
import { restoreEnabledPlatformConnections } from '../../platforms/platform-persistence'
import { AnyPlatformConfig, Platform } from '../../platforms/types'
import { randomUUID } from 'crypto'
import { AnyStreamEvent, UserInfo } from '../../platforms/types'

let hasRestoredPlatformConnections = false

export function registerPlatformHandlers(
  platformManager: PlatformManager,
  chatRelayService: ChatRelayService,
  db: Database
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
    (_event, payload: { platform?: Platform; type: 'gift' | 'follow' | 'superfan'; suppressSound?: boolean }) => {
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
}

function createSimulatedEvent(payload: {
  platform?: Platform
  type: 'gift' | 'follow' | 'superfan'
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
    badges: []
  }
}

function resolveSimulationPlatform(platform: Platform | undefined): Platform {
  return platform === 'twitch' || platform === 'youtube' || platform === 'kick' ? platform : 'tiktok'
}
