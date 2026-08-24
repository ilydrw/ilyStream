import type { AppSettings, ViewerJoinSound } from '../../shared/app-settings'
import {
  isStreamPlatform,
  type AnyStreamEvent,
  type GiftEvent,
  type JoinEvent,
  type LikeEvent,
  type SubscriptionEvent
} from '../platforms/types'
import type { SoundboardService } from './soundboard-service'
import type { OverlayServer } from '../overlay/overlay-server'
import type { AlertRule } from '../../shared/alert-rules'
import { LowValueGiftCooldown } from '../../shared/gift-alert-protection'
import {
  formatGiftSubscriptionAlert,
  formatSubscriptionTier,
  resolveSubscriptionGifter
} from '../../shared/subscription-display'
import type { AcceptedLikeProgress } from '../overlay/managers/likes-tracker'

type AlertKind = 'Gift' | 'Follow' | 'Superfan'

const GIFT_ALERT_AGGREGATION_MS = 150
const EVENT_SOUND_DEDUPE_MS = 5 * 60 * 1000
const TWITCH_GIFT_SUB_SOUND_DEDUPE_MS = 10_000
const SUPERFAN_JOIN_DEDUPE_MS = 10 * 60 * 1000
// A platform must stay disconnected at least this long before the next
// successful connect counts as a NEW stream session (re-arming intro sounds).
// TikTok drops and auto-reconnects constantly mid-stream — and its connector
// will even auto-reconnect into the next live after a streamEnd — so a long
// offline gap is the stream-boundary signal, not the connect itself.
const STREAM_SESSION_GAP_MS = 10 * 60 * 1000
// How often (per viewer) we're willing to run the DB-touching intro-sound match.
// TikTok's join/member event is unreliable, so intros trigger on a viewer's
// first activity of ANY kind; this throttle stops high like/chat volume from
// resolving the same viewer on every event. Actual re-fire timing is still
// governed by each rule's own cooldown.
const INTRO_LOOKUP_THROTTLE_MS = 60 * 1000
const LIKE_MILESTONE_INTERVAL = 10_000

export type ViewerProfileResolver = (
  platform: string,
  username: string,
  identity?: { platformUserId?: string | null; displayName?: string | null }
) => string | null

export class EventSoundService {
  private settings: AppSettings | null = null
  private recentSuperfanJoinUsers = new Map<string, number>()
  private recentRuleHits = new Map<string, number>()
  private introLookupAt = new Map<string, number>()
  // Viewers whose intro already played during the current stream session.
  // This is intentionally shared by every streaming platform: linked TikTok,
  // Twitch, YouTube, and Kick accounts represent one viewer, not four intros.
  private introPlayed = new Set<string>()
  private platformConnected = new Map<string, boolean>()
  private streamSessionInactiveAt: number | null = null
  private giftAggregationTimers = new Map<string, { count: number, timer: NodeJS.Timeout, lastEvent: GiftEvent }>()
  private recentEventSoundIds = new Map<string, number>()
  private recentTwitchGiftSubSounds = new Map<string, number>()
  private lowValueGiftAlertCooldown = new LowValueGiftCooldown()

  constructor(
    private readonly soundboardService: Pick<SoundboardService, 'playSound' | 'stopAll'>,
    private readonly overlayServer: Pick<OverlayServer, 'pushAlert' | 'getStatus'>,
    private readonly resolveViewerProfileId: ViewerProfileResolver = () => null
  ) {}

  applySettings(settings: AppSettings): void {
    this.settings = this.withLegacyAlertRouteValues(settings)
  }

  /**
   * Feed platform connection status changes in so intro sounds re-arm on
   * stream boundaries. "New stream" = reconnecting after every stream platform
   * has been disconnected for at least {@link STREAM_SESSION_GAP_MS}. Quick
   * reconnect blips and one-platform drops during a multistream keep the same
   * session, so neither can replay an intro.
   */
  handleConnectionStatus(platform: string, status: string): void {
    if (!isStreamPlatform(platform)) return

    const wasConnected = this.platformConnected.get(platform) ?? false
    const isConnected = status === 'connected'
    if (isConnected === wasConnected) return
    this.platformConnected.set(platform, isConnected)

    if (!isConnected) {
      if (!this.hasConnectedStreamPlatform()) {
        this.streamSessionInactiveAt = Date.now()
      }
      return
    }

    const inactiveAt = this.streamSessionInactiveAt
    this.streamSessionInactiveAt = null
    if (inactiveAt !== null && Date.now() - inactiveAt >= STREAM_SESSION_GAP_MS) {
      this.introPlayed.clear()
    }
  }

  private hasConnectedStreamPlatform(): boolean {
    return [...this.platformConnected.values()].some(Boolean)
  }

  playSound(soundId: string, volume: number): void {
    this.soundboardService.playSound(soundId, volume)
  }

  /** Panic-stop every active soundboard playback. */
  stopAll(): void {
    this.soundboardService.stopAll()
  }

  processEvent(event: AnyStreamEvent, likeProgress?: AcceptedLikeProgress): void {
    if (!this.settings) return

    // Personal intro ("join") sounds fire on a viewer's FIRST activity of the
    // session, from ANY event type — TikTok's member/join event is unreliable
    // and frequently never fires for regulars (they chat/gift/like without ever
    // producing a `join`), so gating intros on it alone means they never play.
    // A milestone that uses the same intro sound counts as that first playback,
    // preventing the single like packet from playing it twice back-to-back.
    const firedLikeMilestone = event.type === 'like'
      ? this.handleLikeMilestone(event, likeProgress)
      : false
    if (!firedLikeMilestone) {
      this.handleViewerIntroSound(event)
    }

    switch (event.type) {
      case 'gift':
        if (event.platform === 'tiktok' && event.isSuperFanBox) {
          this.handleAlert('Superfan', this.toSuperFanBoxAlertEvent(event))
          return
        }
        this.aggregateGift(event)
        return

      case 'follow':
        this.handleAlert('Follow', event)
        return

      case 'subscription':
        this.handleAlert('Superfan', event)
        return

      case 'join':
        if (this.shouldTreatJoinAsSuperfan(event)) {
          this.handleAlert('Superfan', event)
          return
        }
        break
    }

    this.handleRuleAlerts(event)
  }

  private aggregateGift(event: GiftEvent): void {
    if (!this.settings) return
    if (event.isCombo) return

    const userKey = event.user.id || event.user.username
    const giftKey = `${event.platform}:${userKey}:${event.giftId || event.giftName}`

    const existing = this.giftAggregationTimers.get(giftKey)
    if (existing) {
      clearTimeout(existing.timer)
      existing.count += (event.giftCount || 1)
      existing.lastEvent = event

      const runTimer = () => {
        const final = this.giftAggregationTimers.get(giftKey)
        if (final) {
          this.giftAggregationTimers.delete(giftKey)
          const aggregatedEvent = {
            ...final.lastEvent,
            giftCount: final.count,
            isCombo: false,
            // Sum up monetary value if available
            monetaryValue: (final.lastEvent.monetaryValue || 0) * (final.count / (final.lastEvent.giftCount || 1))
          }
          this.handleAlert('Gift', aggregatedEvent as any)
        }
      }
      existing.timer = setTimeout(runTimer, GIFT_ALERT_AGGREGATION_MS)
    } else {
      this.giftAggregationTimers.set(giftKey, {
        count: event.giftCount || 1,
        lastEvent: event,
        timer: setTimeout(() => {
          const final = this.giftAggregationTimers.get(giftKey)
          if (final) {
            this.giftAggregationTimers.delete(giftKey)
            const aggregatedEvent = {
              ...final.lastEvent,
              giftCount: final.count,
              isCombo: false,
              // Sum up monetary value if available
              monetaryValue: (final.lastEvent.monetaryValue || 0) * (final.count / (final.lastEvent.giftCount || 1))
            }
            this.handleAlert('Gift', aggregatedEvent as any)
          }
        }, GIFT_ALERT_AGGREGATION_MS)
      })
    }
  }

  private shouldSuppressRepeatedTwitchGiftSubSound(event: AnyStreamEvent): boolean {
    if (event.type !== 'subscription' || event.platform !== 'twitch' || !event.isGift) return false

    const gifter = resolveSubscriptionGifter(event)
    const gifterKey = (gifter?.id || gifter?.username || 'anonymous').trim().toLowerCase()
    const tier = formatSubscriptionTier(event.platform, event.tier).toLowerCase()
    const key = `${gifterKey}:${tier}`
    const now = Date.now()
    const previous = this.recentTwitchGiftSubSounds.get(key)
    this.recentTwitchGiftSubSounds.set(key, now)

    if (this.recentTwitchGiftSubSounds.size > 500) {
      const cutoff = now - TWITCH_GIFT_SUB_SOUND_DEDUPE_MS
      for (const [candidate, timestamp] of this.recentTwitchGiftSubSounds) {
        if (timestamp < cutoff) this.recentTwitchGiftSubSounds.delete(candidate)
      }
    }

    if (previous === undefined || now - previous >= TWITCH_GIFT_SUB_SOUND_DEDUPE_MS) {
      return false
    }
    return true
  }

  private shouldSuppressDuplicateEventSound(event: AnyStreamEvent): boolean {
    const eventId = String(event.id || '').trim()
    if (!eventId) return false

    const key = `${event.platform}:${event.type}:${eventId}`
    const now = Date.now()
    const previous = this.recentEventSoundIds.get(key)
    this.recentEventSoundIds.set(key, now)

    if (this.recentEventSoundIds.size > 2000) {
      const cutoff = now - EVENT_SOUND_DEDUPE_MS
      for (const [candidate, timestamp] of this.recentEventSoundIds) {
        if (timestamp < cutoff) this.recentEventSoundIds.delete(candidate)
      }
    }

    return previous !== undefined && now - previous < EVENT_SOUND_DEDUPE_MS
  }

  private toSuperFanBoxAlertEvent(event: GiftEvent): SubscriptionEvent {
    return {
      ...event,
      type: 'subscription',
      user: {
        ...event.user,
        isSubscriber: true,
        isFanClubMember: true,
        isSuperFan: true
      },
      tier: 'Super Fan Box',
      months: 1,
      isGift: false
    }
  }

  private handleAlert(kind: AlertKind, event: AnyStreamEvent): void {
    if (!this.settings) return

    if (this.settings.alertRules?.length) {
      this.handleRuleAlerts(event)
      return
    }

    if (this.shouldSuppressLowValueGiftAlert(event)) return

    const soundEnabled = this.settings[`eventSound${kind}Enabled`]
    const soundId = this.settings[`eventSound${kind}SoundId`]
    const soundVolume = this.settings[`eventSound${kind}Volume`]
    const suppressSound = Boolean((event.raw as any)?.suppressEventSound)
    const isSimulated = Boolean((event.raw as any)?.simulated)
    const shouldDeduplicateSound = !suppressSound && !isSimulated && Boolean(soundEnabled && soundId)
    const suppressDuplicateEventSound = shouldDeduplicateSound && this.shouldSuppressDuplicateEventSound(event)
    const suppressRepeatedGiftSubSound = shouldDeduplicateSound && !suppressDuplicateEventSound
      && this.shouldSuppressRepeatedTwitchGiftSubSound(event)
    const hasSound = !suppressSound
      && !suppressDuplicateEventSound
      && !suppressRepeatedGiftSubSound
      && soundEnabled
      && soundId

    if (hasSound) {
      this.soundboardService.playSound(soundId, soundVolume)
    }

    const imageEnabled = this.settings[`eventImage${kind}Enabled`]
    const imageUrl = this.resolveImageUrl(kind, event)
    const textEnabled = this.settings[`eventText${kind}Enabled`]
    const textTemplate = this.settings[`eventText${kind}Template`]
    const hasImage = imageEnabled && imageUrl
    const hasText = textEnabled && textTemplate.trim().length > 0

    if (!hasImage && !hasText && !hasSound) return

    // Send plain (escaped) text in `template` and let the overlay's wrapper
    // div apply textColor / backgroundColor / borderColor / fontSize.
    // Previously we also baked styles into the HTML here, which double-styled
    // the alert (nested borders, doubled padding, two backgrounds).
    const text = hasText
      ? formatAlertText(
          kind === 'Superfan' && event.type === 'subscription' && event.isGift
            ? formatGiftSubscriptionAlert(event)
            : this.replaceVariables(this.settings[`eventText${kind}Template`], event)
        )
      : ''

    // Audio is played by the renderer above. We deliberately omit `audioUrl`
    // from the overlay payload so the alert overlay only renders the visual.
    // If we also sent audioUrl, every overlay browser source would play the
    // same clip — anyone with OBS + a preview tab would hear it doubled.
    this.overlayServer.pushAlert(
      {
        id: event.id,
        template: text,
        imageUrl: hasImage ? imageUrl : '',
        durationMs: this.settings[`eventAlert${kind}DurationMs`],
        animationIn: this.settings[`eventAlert${kind}AnimationIn`],
        animationOut: this.settings[`eventAlert${kind}AnimationOut`],
        textColor: this.settings[`eventText${kind}Color`],
        backgroundColor: this.settings[`eventText${kind}BackgroundColor`],
        borderColor: this.settings[`eventText${kind}BorderColor`],
        fontSize: this.settings[`eventText${kind}FontSize`],
        fontWeight: this.settings[`eventAlert${kind}FontWeight`],
        textShadow: this.settings[`eventAlert${kind}TextShadow`],
        layout: this.settings[`eventAlert${kind}Layout`],
        imageTop: this.settings[`eventAlert${kind}ImageTop`],
        imageLeft: this.settings[`eventAlert${kind}ImageLeft`],
        alertTop: this.settings.alertTop,
        alertLeft: this.settings.alertLeft
      },
      event.platform
    )
  }

  private handleRuleAlerts(event: AnyStreamEvent): void {
    if (!this.settings?.alertRules?.length) return
    if (this.shouldSuppressLowValueGiftAlert(event)) return

    const rules = [...this.settings.alertRules]
      .filter(rule => this.matchesRule(rule, event))
      .sort((a, b) => b.priority - a.priority)

    if (rules.length === 0) {
      // Only worth shouting about for events that meaningfully drive alerts.
      // Chat events spam this otherwise.
      if (event.type !== 'chat' && event.type !== 'like') {
        console.log(
          `[event-sound] No alert rules matched ${event.type} on ${event.platform}` +
          ` (have ${this.settings.alertRules.length} total rule(s))`
        )
      }
      return
    }

    for (const rule of rules) {
      this.handleRuleAlert(rule, event)
      break
    }
  }

  private matchesRule(rule: AlertRule, event: AnyStreamEvent): boolean {
    if (!rule.enabled) return false
    if (!rule.eventTypes.includes(event.type as any)) return false
    if (!rule.platforms.includes('all') && !rule.platforms.includes(event.platform)) return false

    if (event.type === 'gift') {
      if (rule.minGiftCount > 0 && (event.giftCount || 0) < rule.minGiftCount) return false
      if (rule.minAmountCents > 0 && (event.monetaryValue || 0) < rule.minAmountCents) return false
    }

    if (rule.keyword.trim()) {
      const needle = rule.keyword.trim().toLowerCase()
      const haystack = [
        'message' in event ? event.message : '',
        'giftName' in event ? event.giftName : '',
        'tier' in event ? event.tier : '',
        'user' in event ? event.user.username : '',
        'user' in event ? event.user.displayName : ''
      ].join(' ').toLowerCase()
      if (!haystack.includes(needle)) return false
    }

    // Simulated events (the Test button) should always fire — they share a
    // single hard-coded user, so a per-user cooldown would silently block
    // every test after the first.
    const isSimulated = Boolean((event.raw as any)?.simulated)
    if (rule.cooldownMs > 0 && !isSimulated) {
      const previous = this.recentRuleHits.get(this.cooldownKey(rule, event))
      if (previous && Date.now() - previous < rule.cooldownMs) return false
    }

    return true
  }

  private cooldownKey(rule: AlertRule, event: AnyStreamEvent): string {
    const subject = 'user' in event ? event.user.id || event.user.username : 'global'
    return `${rule.id}:${event.platform}:${subject}`
  }

  private recordRuleFire(rule: AlertRule, event: AnyStreamEvent): void {
    if (rule.cooldownMs <= 0) return
    if ((event.raw as any)?.simulated) return
    const now = Date.now()
    this.recentRuleHits.set(this.cooldownKey(rule, event), now)

    if (this.recentRuleHits.size > 1000) {
      const cutoff = now - 24 * 60 * 60 * 1000
      for (const [key, ts] of this.recentRuleHits) {
        if (ts < cutoff) this.recentRuleHits.delete(key)
      }
    }
  }

  private handleRuleAlert(rule: AlertRule, event: AnyStreamEvent): void {
    if (!this.settings) return

    const suppressSound = Boolean((event.raw as any)?.suppressEventSound)
    const isSimulated = Boolean((event.raw as any)?.simulated)
    const shouldDeduplicateSound = !suppressSound && !isSimulated && rule.soundEnabled && Boolean(rule.soundId)
    const suppressDuplicateEventSound = shouldDeduplicateSound && this.shouldSuppressDuplicateEventSound(event)
    const suppressRepeatedGiftSubSound = shouldDeduplicateSound && !suppressDuplicateEventSound
      && this.shouldSuppressRepeatedTwitchGiftSubSound(event)
    const hasSound = !suppressSound
      && !suppressDuplicateEventSound
      && !suppressRepeatedGiftSubSound
      && rule.soundEnabled
      && Boolean(rule.soundId)

    // The alert overlay's <audio> plays the sound via the `audioUrl` on the
    // pushAlert payload below. We only ALSO play via the renderer (the
    // soundboard path) when no overlay client is connected — otherwise the
    // streamer would hear every alert twice (once from the renderer, once
    // from the overlay browser source).
    //
    // Test-button events always play locally because the UI promises a
    // soundboard test and an SSE connection does not prove that OBS is routing
    // browser-source audio. Their overlay payload omits audio below, keeping the
    // test at exactly one playback.
    const localMonitoring = Boolean(this.settings?.alertSoundLocalMonitoring)
    const overlayAudioSink = this.hasOverlayAudioSink()
    if (hasSound && (isSimulated || localMonitoring || !overlayAudioSink)) {
      this.soundboardService.playSound(rule.soundId, rule.soundVolume)
    }

    const imageUrl = this.resolveRuleImageUrl(rule, event)
    const hasImage = rule.imageEnabled && Boolean(imageUrl)
    const hasText = rule.textEnabled && rule.textTemplate.trim().length > 0
    if (!hasImage && !hasText && !hasSound) {
      console.warn(
        `[event-sound] Rule "${rule.name}" matched ${event.type} but has no sound/image/text enabled — nothing to fire.`
      )
      return
    }

    console.log(
      `[event-sound] Firing rule "${rule.name}" for ${event.type} (sound=${hasSound}, image=${hasImage}, text=${hasText})`
    )

    const text = hasText
      ? formatAlertText(
          rule.id === 'default-subs' && event.type === 'subscription' && event.isGift
            ? formatGiftSubscriptionAlert(event)
            : this.replaceVariables(rule.textTemplate, event)
        )
      : ''

    this.overlayServer.pushAlert(
      {
        id: `${event.id}:${rule.id}`,
        // Rule-based alerts render with the rule's own styling (border,
        // background, colors, layout, template). We intentionally do NOT apply
        // the hardcoded "clean" variant here — that ignored the rule's
        // borderColor/backgroundColor and made the editor's Style controls
        // do nothing for gift/follow/sub alerts.
        eventType: event.type,
        template: text,
        imageUrl: hasImage ? imageUrl : '',
        durationMs: rule.durationMs,
        animationIn: rule.animationIn,
        animationOut: rule.animationOut,
        textColor: rule.textColor,
        backgroundColor: rule.backgroundColor,
        backgroundOpacity: rule.backgroundOpacity,
        borderColor: rule.borderColor,
        borderWidth: rule.borderWidth,
        borderRadius: rule.borderRadius,
        fontSize: rule.fontSize,
        // If local monitoring owns playback (or no overlay was connected), the
        // sound already went through the local queue. Do not also leave audio
        // in alert history for a browser source to duplicate or replay later.
        audioUrl: hasSound && !isSimulated && !localMonitoring && overlayAudioSink ? rule.soundId : undefined,
        audioVolume: rule.soundVolume,
        fontWeight: rule.fontWeight,
        textShadow: rule.textShadow,
        textAlign: rule.textAlign,
        layout: rule.layout,
        imageTop: rule.imageTop,
        imageLeft: rule.imageLeft,
        imageSize: rule.imageSize,
        imagePlacement: rule.imagePlacement,
        paddingX: rule.paddingX,
        paddingY: rule.paddingY,
        // Per-rule screen position wins over the global alert position when set.
        alertTop: resolveAlertPositionValue(rule.alertTop, this.settings.alertTop),
        alertLeft: resolveAlertPositionValue(rule.alertLeft, this.settings.alertLeft)
      },
      event.platform
    )

    this.recordRuleFire(rule, event)
  }

  private hasOverlayAudioSink(): boolean {
    try {
      return Number(this.overlayServer.getStatus()?.alertClientCount || 0) > 0
    } catch {
      return false
    }
  }

  private handleLikeMilestone(event: LikeEvent, progress?: AcceptedLikeProgress): boolean {
    if (!this.settings?.eventLikeMilestoneEnabled || event.platform !== 'tiktok') return false

    const isSimulated = Boolean((event.raw as any)?.simulated)
    const acceptedAmount = isSimulated
      ? LIKE_MILESTONE_INTERVAL
      : Math.max(0, Math.floor(progress?.acceptedAmount || 0))
    const viewerTotal = isSimulated
      ? LIKE_MILESTONE_INTERVAL
      : Math.max(0, Math.floor(progress?.viewerTotal || 0))
    if (acceptedAmount <= 0 || viewerTotal < LIKE_MILESTONE_INTERVAL) return false

    const previousViewerTotal = Math.max(0, viewerTotal - acceptedAmount)
    const firstCrossedMilestone = Math.floor(previousViewerTotal / LIKE_MILESTONE_INTERVAL) + 1
    const lastCrossedMilestone = Math.floor(viewerTotal / LIKE_MILESTONE_INTERVAL)

    let fired = false
    for (let milestoneIndex = firstCrossedMilestone; milestoneIndex <= lastCrossedMilestone; milestoneIndex++) {
      if (!this.settings.eventLikeMilestoneRepeatEnabled && milestoneIndex !== 1) continue
      this.fireLikeMilestoneAlert(event, milestoneIndex * LIKE_MILESTONE_INTERVAL, isSimulated)
      fired = true
    }
    return fired
  }

  private fireLikeMilestoneAlert(event: LikeEvent, milestoneLikes: number, isSimulated: boolean): void {
    if (!this.settings) return

    const introSound = this.findViewerIntroSound(event)
    const soundId = introSound?.soundId || this.settings.eventLikeMilestoneFallbackSoundId
    const soundVolume = introSound?.volume ?? this.settings.eventLikeMilestoneFallbackVolume
    const hasSound = Boolean(soundId)
    const overlayAudioSink = this.hasOverlayAudioSink()
    const localMonitoring = Boolean(this.settings.alertSoundLocalMonitoring)

    if (hasSound && (isSimulated || localMonitoring || !overlayAudioSink)) {
      this.soundboardService.playSound(soundId, soundVolume)
    }

    if (introSound && !isSimulated) {
      this.introPlayed.add(this.getIntroPlayedKey(introSound))
    }

    const displayName = event.user.displayName || event.user.username || 'TikTok viewer'
    const formattedLikes = milestoneLikes.toLocaleString('en-US')
    const message = this.replaceVariables(this.settings.eventLikeMilestoneTemplate, event)
      .replace(/{milestoneLikes}/g, formattedLikes)
      .replace(/{likes}/g, formattedLikes)

    this.overlayServer.pushAlert({
      id: `${event.id}:like-milestone:${milestoneLikes}`,
      eventType: 'like-milestone',
      variant: 'clean-like-milestone',
      eyebrow: 'Like milestone',
      headline: displayName,
      subtitle: message,
      meta: `${formattedLikes} likes`,
      accentColor: '#fe2c55',
      template: message,
      imageUrl: event.user.profilePictureUrl || '',
      durationMs: this.settings.eventLikeMilestoneDurationMs,
      animationIn: 'zoom',
      animationOut: 'fade',
      audioUrl: hasSound && !isSimulated && !localMonitoring && overlayAudioSink ? soundId : undefined,
      audioVolume: soundVolume,
      alertTop: this.settings.alertTop,
      alertLeft: this.settings.alertLeft
    }, event.platform)
  }

  private shouldSuppressLowValueGiftAlert(event: AnyStreamEvent): boolean {
    const shouldSuppress = this.lowValueGiftAlertCooldown.shouldSuppress(event)
    if (shouldSuppress) {
      console.log('[event-sound] Suppressed low-value TikTok gift alert during anti-spam cooldown.')
    }
    return shouldSuppress
  }

  private resolveRuleImageUrl(rule: AlertRule, event: AnyStreamEvent): string {
    if (rule.imageAssetId) return rule.imageAssetId
    if (!rule.useEventImage) return ''
    if (event.type === 'gift') return event.giftImageUrl || ''
    if ('user' in event) return event.user.profilePictureUrl || ''
    return ''
  }

  private resolveImageUrl(kind: AlertKind, event: AnyStreamEvent): string {
    if (!this.settings) return ''

    const selectedImage = this.settings[`eventImage${kind}AssetId`]
    if (selectedImage) return selectedImage

    if (kind === 'Gift' && event.type === 'gift') {
      return event.giftImageUrl || ''
    }

    if (kind === 'Superfan' && 'user' in event) {
      return event.user.profilePictureUrl || ''
    }

    return ''
  }

  private replaceVariables(template: string, event: AnyStreamEvent): string {
    let text = template
    const user = 'user' in event ? event.user : null

    if (user) {
      text = text.replace(/{user}/g, user.displayName || user.username || '')
      text = text.replace(/{username}/g, user.username || '')
      text = text.replace(/{displayName}/g, user.displayName || user.username || '')
      text = text.replace(/{nickname}/g, user.displayName || user.username || '')
    }

    if (event.type === 'gift') {
      text = text.replace(/{giftName}/g, event.giftName || '')
      text = text.replace(/{giftCount}/g, String(event.giftCount || 1))
      text = text.replace(/{amount}/g, String((event.monetaryValue || 0) / 100))
    }

    text = text.replace(/{platform}/g, event.platform)
    text = text.replace(/{eventType}/g, event.type)
    text = text.replace(/{message}/g, 'message' in event ? (event.message ?? '') : '')
    text = text.replace(/{viewerCount}/g, 'viewerCount' in event ? String(event.viewerCount) : '')
    text = text.replace(/{likeCount}/g, 'likeCount' in event ? String(event.likeCount) : '')
    text = text.replace(/{totalLikes}/g, 'totalLikes' in event ? String(event.totalLikes) : '')

    if (event.type === 'subscription') {
      const gifter = resolveSubscriptionGifter(event)
      text = text.replace(/{tier}/g, formatSubscriptionTier(event.platform, event.tier) || 'Superfan')
      text = text.replace(/{months}/g, String(event.months || 1))
      text = text.replace(
        /{recipientName}/g,
        event.user.displayName || event.user.username || ''
      )
      text = text.replace(
        /{gifterName}/g,
        gifter?.displayName || gifter?.username || 'Anonymous'
      )
    } else {
      text = text.replace(/{tier}/g, 'Superfan')
      text = text.replace(/{months}/g, '1')
      text = text.replace(/{recipientName}/g, '')
      text = text.replace(/{gifterName}/g, '')
    }

    return text
  }

  /**
   * Entry point for personal intro sounds. Gates the (DB-touching) match to at
   * most once per viewer per {@link INTRO_LOOKUP_THROTTLE_MS} so a viewer's
   * high-volume likes/chat don't resolve them on every event. The actual play
   * decision (and its per-rule cooldown) lives in {@link playViewerIntroSound}.
   */
  private handleViewerIntroSound(event: AnyStreamEvent): void {
    if (!('user' in event) || !event.user) return
    const rules = this.settings?.viewerJoinSounds
    if (!rules?.length) return

    const identity = event.user.id || event.user.username
    if (!identity) return

    const key = `${event.platform}:${identity}`
    const now = Date.now()
    const lastLookup = this.introLookupAt.get(key)
    if (lastLookup !== undefined && now - lastLookup < INTRO_LOOKUP_THROTTLE_MS) return

    this.introLookupAt.set(key, now)
    if (this.introLookupAt.size > 20000) {
      const cutoff = now - INTRO_LOOKUP_THROTTLE_MS
      for (const [k, ts] of this.introLookupAt) {
        if (ts < cutoff) this.introLookupAt.delete(k)
      }
    }

    this.playViewerIntroSound(event)
  }

  /**
   * Plays a viewer's personal intro sound, if one is configured on their viewer
   * profile (or as a raw platform+username rule). An intro announces arrival,
   * so it plays at most ONCE per stream session — repeat activity stays
   * silent, and the played set only re-arms on a stream boundary (see
   * handleConnectionStatus). Previously this was a cooldown-based rate limit,
   * which replayed the intro mid-stream for anyone who simply stayed active
   * past the cooldown window.
   */
  private playViewerIntroSound(event: AnyStreamEvent): void {
    if (!('user' in event) || !event.user) return
    const rule = this.findViewerIntroSound(event)
    if (!rule) return

    const isSimulated = Boolean((event.raw as any)?.simulated)
    // Profile-backed rules use the linked profile as the cross-platform person
    // identity. Raw username rules use their stable rule id, avoiding a key
    // flip if profile resolution starts succeeding later in the same stream.
    const playedKey = this.getIntroPlayedKey(rule)
    if (!isSimulated && this.introPlayed.has(playedKey)) return

    console.log(`[event-sound] Playing join sound for ${event.user.username} (rule ${rule.id})`)
    const localMonitoring = Boolean(this.settings?.alertSoundLocalMonitoring)
    if (!isSimulated && !localMonitoring && this.hasOverlayAudioSink()) {
      // Alert audio already uses the overlay's FIFO when OBS/browser-source is
      // the active audio sink. Route joins there too so the two kinds cannot
      // overlap in separate renderer contexts.
      this.overlayServer.pushAlert({
        id: `${event.id}:join:${rule.id}`,
        durationMs: 1000,
        audioUrl: rule.soundId,
        audioVolume: rule.volume
      }, event.platform)
    } else {
      this.soundboardService.playSound(rule.soundId, rule.volume)
    }

    if (!isSimulated) {
      this.introPlayed.add(playedKey)
    }
  }

  private findViewerIntroSound(event: AnyStreamEvent): ViewerJoinSound | undefined {
    if (!('user' in event) || !event.user) return undefined
    const rules = this.settings?.viewerJoinSounds
    if (!rules?.length) return undefined

    const username = normalizeJoinUsername(event.user.username)
    if (!username) return undefined

    const viewerProfileId = this.resolveViewerProfileId(event.platform, event.user.username, {
      platformUserId: event.user.id,
      displayName: event.user.displayName
    })

    return rules.find((candidate) => {
      if (!candidate.enabled || !candidate.soundId) return false
      if (candidate.viewerProfileId) {
        return Boolean(viewerProfileId) && candidate.viewerProfileId === viewerProfileId
      }
      if (candidate.platform !== 'all' && candidate.platform !== event.platform) return false
      return normalizeJoinUsername(candidate.username) === username
    })
  }

  private getIntroPlayedKey(rule: ViewerJoinSound): string {
    return rule.viewerProfileId
      ? `profile:${rule.viewerProfileId}`
      : `rule:${rule.id}`
  }

  private shouldTreatJoinAsSuperfan(event: JoinEvent): boolean {
    if (!event.user.isFanClubMember && !event.user.isSubscriber) return false

    const userKey = event.user.id || event.user.username
    if (!userKey) return true

    const dedupeKey = `${event.platform}:${userKey}`
    const now = Date.now()

    for (const [key, seenAt] of this.recentSuperfanJoinUsers) {
      if (now - seenAt > SUPERFAN_JOIN_DEDUPE_MS) {
        this.recentSuperfanJoinUsers.delete(key)
      }
    }

    const previousSeenAt = this.recentSuperfanJoinUsers.get(dedupeKey)
    if (previousSeenAt && now - previousSeenAt < SUPERFAN_JOIN_DEDUPE_MS) return false

    this.recentSuperfanJoinUsers.set(dedupeKey, now)
    return true
  }

  private withLegacyAlertRouteValues(settings: AppSettings): AppSettings {
    const alertRules = ((settings.alertRules || []) as AlertRule[]).map(rule => {
      if (rule.id === 'default-gifts') {
        // Sound/image/text plumbing still honours the legacy flat settings for
        // backward-compat with migrated users. But VISUAL STYLE (border, colors,
        // layout, animation, sizing) now comes straight from the rule — the
        // Alerts editor is the only thing that sets those, so overriding them
        // here silently discarded every style edit (e.g. a 'gradient' border
        // reverting to the old default).
        const routeHasImageAsset = Boolean(rule.imageAssetId)
        return {
          ...rule,
          soundEnabled: settings.eventSoundGiftEnabled,
          soundId: settings.eventSoundGiftSoundId || rule.soundId,
          soundVolume: settings.eventSoundGiftVolume,
          imageEnabled: routeHasImageAsset ? rule.imageEnabled : settings.eventImageGiftEnabled,
          imageAssetId: rule.imageAssetId || settings.eventImageGiftAssetId,
          textEnabled: settings.eventTextGiftEnabled,
          textTemplate: settings.eventTextGiftTemplate || rule.textTemplate
        }
      }

      if (rule.id === 'default-follows') {
        const routeHasImageAsset = Boolean(rule.imageAssetId)
        return {
          ...rule,
          soundEnabled: settings.eventSoundFollowEnabled,
          soundId: settings.eventSoundFollowSoundId || rule.soundId,
          soundVolume: settings.eventSoundFollowVolume,
          imageEnabled: routeHasImageAsset ? rule.imageEnabled : settings.eventImageFollowEnabled,
          imageAssetId: rule.imageAssetId || settings.eventImageFollowAssetId,
          textEnabled: settings.eventTextFollowEnabled,
          textTemplate: settings.eventTextFollowTemplate || rule.textTemplate
        }
      }

      if (rule.id === 'default-subs') {
        const routeHasImageAsset = Boolean(rule.imageAssetId)
        return {
          ...rule,
          soundEnabled: settings.eventSoundSuperfanEnabled,
          soundId: settings.eventSoundSuperfanSoundId || rule.soundId,
          soundVolume: settings.eventSoundSuperfanVolume,
          imageEnabled: routeHasImageAsset ? rule.imageEnabled : settings.eventImageSuperfanEnabled,
          imageAssetId: rule.imageAssetId || settings.eventImageSuperfanAssetId,
          textEnabled: settings.eventTextSuperfanEnabled,
          textTemplate: settings.eventTextSuperfanTemplate || rule.textTemplate
        }
      }

      return rule
    })

    return { ...settings, alertRules }
  }

  private getProfessionalAlertDetails(event: AnyStreamEvent): any {
    const isGift = event.type === 'gift'
    const isFollow = event.type === 'follow'
    const isSub = event.type === 'subscription' || (event.type === 'join' && this.shouldTreatJoinAsSuperfan(event as any))

    let eyebrow = ''
    let subtitle = ''
    let variant = ''
    let accentColor = '#38bdf8'

    if (event.platform === 'tiktok') {
      if (isGift) {
        eyebrow = 'Gift received'
        subtitle = `sent ${event.giftCount || 1}x ${event.giftName}`
        variant = 'clean-gift'
        accentColor = '#f7c948'
      } else if (isFollow) {
        eyebrow = 'New follower'
        subtitle = 'started following'
        variant = 'clean-follow'
        accentColor = '#38bdf8'
      } else if (isSub) {
        eyebrow = 'New subscriber'
        subtitle = 'joined the community'
        variant = 'clean-superfan'
        accentColor = '#e879f9'
      }
      return {
        eventType: event.type,
        variant,
        eyebrow,
        headline: 'user' in event ? event.user.displayName : '',
        subtitle,
        meta: 'TikTok',
        accentColor
      }
    }

    return {}
  }
}

/**
 * A rule-level screen position of -1 (or anything non-finite — rules saved
 * before the field existed) defers to the global alert position setting.
 */
function resolveAlertPositionValue(ruleValue: unknown, globalValue: unknown): unknown {
  const numeric = Number(ruleValue)
  if (Number.isFinite(numeric) && numeric >= 0) return Math.min(100, numeric)
  return globalValue
}

function normalizeJoinUsername(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatAlertText(value: string): string {
  return value
    .split(/\r?\n/)
    .map(escapeHtml)
    .join('<br />')
}
