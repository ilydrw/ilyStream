import { randomUUID } from 'crypto'
import type { 
  ChatEvent, 
  GiftEvent, 
  SubscriptionEvent, 
  RaidEvent, 
  UserInfo,
  FollowEvent
} from '../types'

export class TwitchMapper {
  mapUserFromMsg(user: string, msg: any, isFollower: boolean): UserInfo {
    const userInfo = msg?.userInfo
    const badges = userInfo?.badges
      ? Array.from(userInfo.badges.entries()).map(([id]: [string, any]) => ({
          id,
          name: id,
          imageUrl: `https://static-cdn.jtvnw.net/badges/v2/${id}/1`
        }))
      : []
    const badgeText = badges.map((badge) => `${badge.id} ${badge.name}`).join(' ').toLowerCase()

    return {
      id: userInfo?.userId || msg?.userId || msg?.tags?.get?.('user-id') || user,
      username: user,
      displayName: userInfo?.displayName || user,
      profilePictureUrl: undefined,
      isModerator: userInfo?.isMod || false,
      isSubscriber: userInfo?.isSubscriber || false,
      isVip: userInfo?.isVip || false,
      isFollower,
      isFanClubMember: Boolean(userInfo?.isSubscriber),
      isTeamMember: badgeText.includes('staff'),
      badges
    }
  }

  mapChat(user: string, message: string, msg: any, isFollower: boolean): ChatEvent {
    const emotes: any[] = []
    try {
      if (msg?.emoteOffsets) {
        for (const [id, ranges] of msg.emoteOffsets.entries()) {
          for (const range of ranges) {
            const parts = range.split('-')
            if (parts.length === 2) {
              const start = Number(parts[0])
              const end = Number(parts[1])
              if (!isNaN(start) && !isNaN(end)) {
                emotes.push({
                  id,
                  name: message.substring(start, end + 1),
                  imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`,
                  startIndex: start,
                  endIndex: end
                })
              }
            }
          }
        }
      }
    } catch {}

    return {
      id: msg?.id || randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'chat',
      raw: msg,
      user: this.mapUserFromMsg(user, msg, isFollower),
      message,
      emotes,
      isReply: !!msg.parentMessageId,
      replyToUsername: msg.parentDisplayName || undefined
    }
  }

  mapFollow(e: any): FollowEvent {
    return {
      id: randomUUID(),
      platform: 'twitch',
      timestamp: e.followDate ?? new Date(),
      type: 'follow',
      raw: e,
      user: {
        id: e.userId,
        username: e.userName,
        displayName: e.userDisplayName || e.userName,
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        isFollower: true,
        badges: []
      }
    }
  }

  mapSubscription(user: string, subInfo: any, isGift: boolean): SubscriptionEvent {
    return {
      id: randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'subscription',
      raw: subInfo,
      user: {
        id: subInfo?.userId || user,
        username: user,
        displayName: subInfo?.displayName || user,
        isModerator: false,
        isSubscriber: true,
        isVip: false,
        badges: []
      },
      tier: subInfo?.plan || '1000',
      months: subInfo?.months || 1,
      message: subInfo?.message,
      isGift,
      monetaryValue: subInfo?.plan === '3000' ? 2499 : subInfo?.plan === '2000' ? 999 : 499
    }
  }

  mapGiftEvent(user: string, msg: any, isFollower: boolean): GiftEvent {
    return {
      id: msg?.id || randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'gift',
      raw: msg,
      user: this.mapUserFromMsg(user, msg, isFollower),
      giftName: 'Bits',
      giftId: 'bits',
      giftCount: msg.bits || 0,
      monetaryValue: msg.bits || 0,
      isCombo: false
    }
  }

  mapRaid(user: string, raidInfo: any): RaidEvent {
    return {
      id: randomUUID(),
      platform: 'twitch',
      timestamp: new Date(),
      type: 'raid',
      raw: raidInfo,
      user: {
        id: user,
        username: user,
        displayName: raidInfo?.displayName || user,
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      },
      viewerCount: raidInfo?.viewerCount || 0
    }
  }
}
