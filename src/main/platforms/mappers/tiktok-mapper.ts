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
  ViewerCountEvent,
  Emote
} from '../types'
import { estimateTikTokCreatorGiftCents } from '../../../shared/tiktok-revenue'
import { decodeHtmlEntities } from '../../../shared/html-entities'

export class TikTokMapper {
  mapUser(data: any): UserInfo {
    const rawBadges = [
      ...(Array.isArray(data?.badges) ? data.badges : []),
      ...(Array.isArray(data?.userBadges) ? data.userBadges : []),
      ...(Array.isArray(data?.user?.badges) ? data.user.badges : []),
      ...(Array.isArray(data?.userDetails?.badges) ? data.userDetails.badges : []),
      ...(Array.isArray(data?.userDetails?.userBadges) ? data.userDetails.userBadges : [])
    ]

    const badges = rawBadges.map((badge: any) => ({
      id: this.firstString(badge?.type, badge?.id, badge?.badgeSceneType, badge?.displayType),
      name: this.firstString(badge?.name, badge?.displayName, badge?.title, badge?.label),
      imageUrl: this.firstString(
        badge?.imageUrl,
        badge?.url,
        badge?.icon?.urlList?.[0],
        badge?.icon?.url_list?.[0],
        badge?.image?.urlList?.[0],
        badge?.image?.url_list?.[0],
        badge?.image?.url?.[0],
        badge?.badgeImage?.urlList?.[0],
        badge?.badgeImage?.url_list?.[0]
      ) || undefined
    }))

    const badgeText = badges.map((badge) => `${badge.id} ${badge.name}`).join(' ').toLowerCase()
    const isSuperFan = Boolean(
      data?.isSuperFan ||
        data?.user?.isSuperFan ||
        data?.userDetails?.isSuperFan ||
        badgeText.includes('superfan') ||
        badgeText.includes('super fan')
    )
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
        isSuperFan ||
          data?.isFanClubMember ||
          data?.user?.isFanClubMember ||
          data?.userDetails?.isFanClubMember ||
          data?.isSubscriber ||
          data?.user?.isSubscriber ||
          data?.userDetails?.isSubscriber ||
          data?.userIdentity?.isSubscriberOfAnchor ||
          data?.user?.userIdentity?.isSubscriberOfAnchor ||
          data?.userDetails?.userIdentity?.isSubscriberOfAnchor ||
          isTikTokFanClubBadgeLabel(badgeText)
      ),
      isSuperFan,
      isTeamMember: Boolean(data?.isTeamMember || badgeText.includes('team')),
      badges
    }
  }

  mapChat(data: any): ChatEvent {
    let comment = data.comment || data.text || data.message || ''
    const emotes: Emote[] = []

    if (Array.isArray(data.emotes) && data.emotes.length > 0) {
      if (!comment.trim()) {
        comment = data.emotes
          .map((item: any) => {
            const name = item?.emoteId || item?.emote?.emoteId || 'emote'
            return `:${name}:`
          })
          .join(' ')

        let currentPos = 0
        data.emotes.forEach((item: any) => {
          const url = item?.emoteImageUrl || item?.emote?.image?.imageUrl
          if (url) {
            const name = `:${item?.emoteId || item?.emote?.emoteId || 'emote'}:`
            emotes.push({
              id: item?.emoteId || item?.emote?.emoteId || randomUUID(),
              name,
              imageUrl: url,
              startIndex: currentPos,
              endIndex: currentPos + name.length - 1
            })
            currentPos += name.length + 1
          }
        })
      } else {
        data.emotes.forEach((item: any) => {
          const url = item?.emoteImageUrl || item?.emote?.image?.imageUrl
          if (url) {
            const name = item?.emoteId || item?.emote?.emoteId || 'emote'
            const startIndex = Number(item.placeInComment) || 0
            const endIndex = startIndex + name.length - 1
            emotes.push({
              id: item?.emoteId || item?.emote?.emoteId || randomUUID(),
              name,
              imageUrl: url,
              startIndex,
              endIndex
            })
          }
        })
      }
    }

    return {
      id: this.messageId(data),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'chat',
      raw: data,
      user: this.mapUser(data),
      message: comment,
      emotes
    }
  }

  mapEmote(data: any): ChatEvent {
    const emotes: Emote[] = []
    const rawEmotes = Array.isArray(data?.emotes) ? data.emotes : Array.isArray(data?.emoteList) ? data.emoteList : []

    const comment = rawEmotes
      .map((item: any) => {
        const name = item?.emoteId || 'emote'
        return `:${name}:`
      })
      .join(' ')

    let currentPos = 0
    rawEmotes.forEach((item: any) => {
      const url = item?.emoteImageUrl || item?.image?.urlList?.[0] || item?.image?.url_list?.[0] || item?.image?.url?.[0]
      if (url) {
        const name = `:${item?.emoteId || 'emote'}:`
        emotes.push({
          id: item?.emoteId || randomUUID(),
          name,
          imageUrl: url,
          startIndex: currentPos,
          endIndex: currentPos + name.length - 1
        })
        currentPos += name.length + 1
      }
    })

    return {
      id: this.messageId(data),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'chat',
      raw: data,
      user: this.mapUser(data),
      message: comment,
      emotes
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
      id: this.messageId(data),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'gift',
      raw: data,
      user: this.mapUser(data),
      giftName: decodeHtmlEntities(gift?.name || data?.giftName || 'Gift'),
      giftId: String(gift?.id || data?.giftId || '0'),
      giftCount: data.repeatCount || data.giftCount || 1,
      monetaryValue: estimateTikTokCreatorGiftCents(diamondCount),
      isCombo: isTikTokGiftComboInProgress(data)
    }
  }

  mapFollow(data: any): FollowEvent {
    return {
      id: this.messageId(data),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'follow',
      raw: data,
      user: this.mapUser(data)
    }
  }

  mapLike(data: any): LikeEvent {
    const likeCount = this.firstNumber(
      data?.likeCount,
      data?.like_count,
      data?.count,
      data?.likes,
      data?.likeInfo?.likeCount,
      data?.likeInfo?.count,
      data?.socialInfo?.likeCount
    ) || 1
    const totalLikes = this.firstNonNegativeNumber(
      data?.totalLikeCount,
      data?.total_like_count,
      data?.totalLikes,
      data?.totalLikesCount,
      data?.likeInfo?.totalLikeCount,
      data?.likeInfo?.totalLikes,
      data?.socialInfo?.totalLikeCount,
      data?.roomInfo?.totalLikeCount,
      data?.roomInfo?.likeCount
    )

    return {
      id: this.messageId(data),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'like',
      raw: data,
      user: this.mapUser(data),
      likeCount,
      totalLikes
    }
  }

  mapShare(data: any): ShareEvent {
    return {
      id: this.messageId(data),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'share',
      raw: data,
      user: this.mapUser(data)
    }
  }

  mapMember(data: any): JoinEvent {
    return {
      id: this.messageId(data),
      platform: 'tiktok',
      timestamp: new Date(),
      type: 'join',
      raw: data,
      user: this.mapUser(data)
    }
  }

  mapSubscription(data: any): SubscriptionEvent {
    return {
      id: this.messageId(data),
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
      viewers: this.mapRoomViewers(data),
      raw: data
    }
  }

  /**
   * TikTok's roomUser payload includes a `topViewers` roster — the identifiable
   * viewers currently in the room (even silent ones). We surface these so the
   * "in stream" list reflects who's actually present, not just who's chatted.
   */
  mapRoomViewers(data: any): UserInfo[] {
    const raw = Array.isArray(data?.topViewers)
      ? data.topViewers
      : Array.isArray(data?.roomInfo?.topViewers)
        ? data.roomInfo.topViewers
        : []
    const viewers: UserInfo[] = []
    for (const entry of raw) {
      const userData = entry?.user ?? entry
      if (!userData || (!userData.uniqueId && !userData.userId && !userData.nickname)) continue
      viewers.push(this.mapUser(userData))
    }
    return viewers
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (value === null || value === undefined) continue
      const text = String(value).trim()
      if (text) return text
    }
    return ''
  }

  private messageId(data: any): string {
    return this.firstString(
      data?.msgId,
      data?.messageId,
      data?.eventId,
      data?.common?.msgId,
      data?.common?.messageId,
      data?.common?.eventId
    ) || randomUUID()
  }

  private firstNumber(...values: unknown[]): number {
    for (const value of values) {
      const number = Number(value)
      if (Number.isFinite(number) && number > 0) return Math.floor(number)
    }
    return 0
  }

  private firstNonNegativeNumber(...values: unknown[]): number {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue
      const number = Number(value)
      if (Number.isFinite(number) && number >= 0) return Math.floor(number)
    }
    return 0
  }
}

function isTikTokGiftComboInProgress(data: any): boolean {
  const repeatEnd = data?.repeatEnd
  const giftType = Number(
    data?.giftType ??
      data?.gift?.giftType ??
      data?.giftDetails?.giftType ??
      data?.extendedGiftInfo?.giftType
  )
  const isRepeatableGift = !Number.isFinite(giftType) || giftType === 1

  if (!isRepeatableGift) return false
  
  // If the combo has definitively ended (repeatEnd is true or 1), it's not in progress.
  if (repeatEnd === true || repeatEnd === 1 || repeatEnd === 'true') {
    return false
  }

  // If repeatEnd is false or undefined (first tick of combo), it is in progress.
  return true
}

function isTikTokFanClubBadgeLabel(label: string): boolean {
  return (
    label.includes('fanclub') ||
    label.includes('fan club') ||
    label.includes('subscriber') ||
    label.includes('subscription') ||
    label.includes('member')
  )
}
