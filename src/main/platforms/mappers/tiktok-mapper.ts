import { randomUUID } from 'crypto'
import type {
  ChatEvent,
  GiftEvent,
  SubscriptionEvent,
  UserInfo,
  FollowEvent,
  LikeEvent,
  ShareEvent,
  JoinEvent,
  ViewerCountEvent
} from '../types'
import { estimateTikTokCreatorGiftCents } from '../../../shared/tiktok-revenue'

export class TikTokMapper {
  mapUser(data: any): UserInfo {
    const rawBadges = [
      ...(Array.isArray(data?.badges) ? data.badges : []),
      ...(Array.isArray(data?.userBadges) ? data.userBadges : []),
      ...(Array.isArray(data?.user?.badges) ? data.user.badges : [])
    ]

    const badges = rawBadges.map((badge: any) => ({
      id: this.firstString(badge?.type, badge?.id, badge?.badgeSceneType, badge?.displayType),
      name: this.firstString(badge?.name, badge?.displayName, badge?.title, badge?.label),
      imageUrl: this.firstString(badge?.url, badge?.imageUrl, badge?.image?.url?.[0]) || undefined
    }))

    const badgeText = badges.map((badge) => `${badge.id} ${badge.name}`).join(' ').toLowerCase()
    const followRole = this.firstNumber(
      data?.followRole,
      data?.followInfo?.followStatus,
      data?.userDetails?.followRole,
      data?.userDetails?.followInfo?.followStatus,
      data?.user?.followInfo?.followStatus
    )

    const usernameRaw = String(data?.uniqueId || data?.userId || `user_${randomUUID().slice(0, 8)}`)
    const username = usernameRaw.toLowerCase().trim()
    const displayName = String(data?.nickname || data?.uniqueId || usernameRaw).trim()

    return {
      id: String(data?.userId || data?.uniqueId || username),
      username,
      displayName,
      profilePictureUrl:
        data?.profilePictureUrl ||
        data?.avatar_thumb?.url_list?.[0] ||
        data?.avatar_medium?.url_list?.[0] ||
        data?.userDetails?.profilePictureUrls?.[0] ||
        undefined,
      isModerator: Boolean(data?.isModerator || data?.userIdentity?.isModeratorOfAnchor),
      isSubscriber: Boolean(data?.isSubscriber || data?.userIdentity?.isSubscriberOfAnchor),
      isVip: Boolean(data?.isOwner || data?.userIdentity?.isAnchor),
      isFollower: Boolean(
        data?.isFollower ||
          data?.isFollowerOfAnchor ||
          data?.isMutualFollowingWithAnchor ||
          data?.userIdentity?.isFollowerOfAnchor ||
          data?.userIdentity?.isMutualFollowingWithAnchor ||
          followRole > 0 ||
          badgeText.includes('follower') ||
          badgeText.includes('following')
      ),
      isFanClubMember: Boolean(
        data?.isFanClubMember ||
          data?.isSubscriber ||
          data?.userIdentity?.isSubscriberOfAnchor ||
          badgeText.includes('fan') ||
          badgeText.includes('subscriber')
      ),
      isTeamMember: Boolean(data?.isTeamMember || badgeText.includes('team')),
      badges
    }
  }

  mapChat(data: any): ChatEvent {
    const comment = data.comment || data.text || data.message || ''
    return {
      id: data.msgId || randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'chat',
      raw: data,
      user: this.mapUser(data),
      message: comment,
      emotes: [] // TikTok connector handles emotes differently or not at all in this SDK
    }
  }

  mapGift(data: any): GiftEvent {
    const gift = data?.extendedGiftInfo ?? data?.giftDetails ?? data?.gift ?? data
    const diamondCount = this.firstNumber(
      gift?.diamond_count,
      gift?.diamondCount,
      gift?.diamond,
      gift?.cost,
      data?.diamondCount,
      data?.gift?.diamond_count
    )

    return {
      id: data.msgId || randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'gift',
      raw: data,
      user: this.mapUser(data),
      giftName: gift?.name || data?.giftName || 'Gift',
      giftId: String(gift?.id || data?.giftId || '0'),
      giftCount: data.repeatCount || data.giftCount || 1,
      monetaryValue: estimateTikTokCreatorGiftCents(diamondCount),
      isCombo: !!data.repeatEnd
    }
  }

  mapFollow(data: any): FollowEvent {
    return {
      id: data.msgId || randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'follow',
      raw: data,
      user: this.mapUser(data)
    }
  }

  mapLike(data: any): LikeEvent {
    return {
      id: data.msgId || randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'like',
      raw: data,
      user: this.mapUser(data),
      likeCount: data.likeCount || 1,
      totalLikes: data.totalLikeCount || 0
    }
  }

  mapShare(data: any): ShareEvent {
    return {
      id: data.msgId || randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'share',
      raw: data,
      user: this.mapUser(data)
    }
  }

  mapJoin(data: any): JoinEvent {
    return {
      id: data.msgId || randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'join',
      raw: data,
      user: this.mapUser(data)
    }
  }

  mapSubscription(data: any): SubscriptionEvent {
    return {
      id: data.msgId || randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'subscription',
      raw: data,
      user: this.mapUser(data),
      tier: 'fan_club',
      months: 1,
      isGift: false,
      monetaryValue: 0
    }
  }

  mapViewerCount(data: any): ViewerCountEvent {
    const count = this.firstNumber(
      data.viewerCount,
      data.count,
      data.totalViewerCount,
      data.roomInfo?.viewerCount
    )
    return {
      id: randomUUID(),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'viewer-count',
      count,
      raw: data
    }
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (value === null || value === undefined) continue
      const text = String(value).trim()
      if (text) return text
    }
    return ''
  }

  private firstNumber(...values: unknown[]): number {
    for (const value of values) {
      const number = Number(value)
      if (Number.isFinite(number) && number > 0) return Math.floor(number)
    }
    return 0
  }
}

