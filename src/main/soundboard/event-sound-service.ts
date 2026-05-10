import type { AppSettings } from '../../shared/app-settings'
import type { AnyStreamEvent, JoinEvent } from '../platforms/types'
import type { SoundboardService } from './soundboard-service'
import type { OverlayServer } from '../overlay/overlay-server'
import type { AlertRule } from '../../shared/alert-rules'

type AlertKind = 'Gift' | 'Follow' | 'Superfan'

const SUPERFAN_JOIN_DEDUPE_MS = 10 * 60 * 1000

export class EventSoundService {
  private settings: AppSettings | null = null
  private recentSuperfanJoinUsers = new Map<string, number>()
  private recentRuleHits = new Map<string, number>()
  private giftAggregationTimers = new Map<string, { count: number, timer: NodeJS.Timeout, lastEvent: AnyStreamEvent }>()

  constructor(
    private readonly soundboardService: Pick<SoundboardService, 'playSound' | 'stopAll'>,
    private readonly overlayServer: Pick<OverlayServer, 'pushAlert'>
  ) {}

  applySettings(settings: AppSettings): void {
    this.settings = this.withLegacyAlertRouteValues(settings)
  }

  playSound(soundId: string, volume: number): void {
    this.soundboardService.playSound(soundId, volume)
  }

  /** Panic-stop every active soundboard playback. */
  stopAll(): void {
    this.soundboardService.stopAll()
  }

  processEvent(event: AnyStreamEvent): void {
    if (!this.settings) return

    switch (event.type) {
      case 'gift':
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
        }
        return
    }

    this.handleRuleAlerts(event)
  }

  private aggregateGift(event: any): void {
    if (!this.settings) return

    const userKey = event.user.id || event.user.username
    const giftKey = `${event.platform}:${userKey}:${event.giftId || event.giftName}`
    
    const existing = this.giftAggregationTimers.get(giftKey)
    if (existing) {
      clearTimeout(existing.timer)
      existing.count += (event.giftCount || 1)
      existing.lastEvent = event
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
        }, 500)
      })
    }
  }

  private handleAlert(kind: AlertKind, event: AnyStreamEvent): void {
    if (!this.settings) return

    if (this.settings.alertRules?.length) {
      this.handleRuleAlerts(event)
      return
    }

    const soundEnabled = this.settings[`eventSound${kind}Enabled`]
    const soundId = this.settings[`eventSound${kind}SoundId`]
    const soundVolume = this.settings[`eventSound${kind}Volume`]
    const suppressSound = Boolean((event.raw as any)?.suppressEventSound)
    const hasSound = !suppressSound && soundEnabled && soundId

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
      ? this.replaceVariables(this.settings[`eventText${kind}Template`], event).replace(
          /\r?\n/g,
          '<br />'
        )
      : ''

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
        audioUrl: hasSound ? soundId : undefined,
        audioVolume: soundVolume,
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

    const rules = [...this.settings.alertRules]
      .filter(rule => this.matchesRule(rule, event))
      .sort((a, b) => b.priority - a.priority)

    for (const rule of rules) {
      this.handleRuleAlert(rule, event)
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

    if (rule.cooldownMs > 0) {
      const cooldownKey = `${rule.id}:${event.platform}:${'user' in event ? event.user.id || event.user.username : 'global'}`
      const now = Date.now()
      const previous = this.recentRuleHits.get(cooldownKey)
      if (previous && now - previous < rule.cooldownMs) return false
      this.recentRuleHits.set(cooldownKey, now)
    }

    return true
  }

  private handleRuleAlert(rule: AlertRule, event: AnyStreamEvent): void {
    if (!this.settings) return

    const suppressSound = Boolean((event.raw as any)?.suppressEventSound)
    const hasSound = !suppressSound && rule.soundEnabled && rule.soundId
    if (hasSound) {
      this.soundboardService.playSound(rule.soundId, rule.soundVolume)
    }

    const imageUrl = this.resolveRuleImageUrl(rule, event)
    const hasImage = rule.imageEnabled && imageUrl
    const hasText = rule.textEnabled && rule.textTemplate.trim().length > 0
    if (!hasImage && !hasText && !hasSound) return

    const text = hasText
      ? this.replaceVariables(rule.textTemplate, event).replace(/\r?\n/g, '<br />')
      : ''

    this.overlayServer.pushAlert(
      {
        id: `${event.id}:${rule.id}`,
        template: text,
        imageUrl: hasImage ? imageUrl : '',
        durationMs: rule.durationMs,
        animationIn: rule.animationIn,
        animationOut: rule.animationOut,
        textColor: rule.textColor,
        backgroundColor: rule.backgroundColor,
        borderColor: rule.borderColor,
        fontSize: rule.fontSize,
        audioUrl: hasSound ? rule.soundId : undefined,
        audioVolume: rule.soundVolume,
        fontWeight: rule.fontWeight,
        textShadow: rule.textShadow,
        layout: rule.layout,
        imageTop: rule.imageTop,
        imageLeft: rule.imageLeft,
        alertTop: this.settings.alertTop,
        alertLeft: this.settings.alertLeft
      },
      event.platform
    )
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
    text = text.replace(/{message}/g, 'message' in event ? event.message : '')
    text = text.replace(/{viewerCount}/g, 'viewerCount' in event ? String(event.viewerCount) : '')
    text = text.replace(/{likeCount}/g, 'likeCount' in event ? String(event.likeCount) : '')
    text = text.replace(/{totalLikes}/g, 'totalLikes' in event ? String(event.totalLikes) : '')

    if (event.type === 'subscription') {
      text = text.replace(/{tier}/g, event.tier || 'Superfan')
      text = text.replace(/{months}/g, String(event.months || 1))
      text = text.replace(
        /{gifterName}/g,
        event.gifterUser?.displayName || event.gifterUser?.username || ''
      )
    } else {
      text = text.replace(/{tier}/g, 'Superfan')
      text = text.replace(/{months}/g, '1')
      text = text.replace(/{gifterName}/g, '')
    }

    return text
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
    const alertRules = (settings.alertRules || []).map(rule => {
      if (rule.id === 'default-gifts') {
        return {
          ...rule,
          soundEnabled: settings.eventSoundGiftEnabled,
          soundId: settings.eventSoundGiftSoundId || rule.soundId,
          soundVolume: settings.eventSoundGiftVolume,
          imageEnabled: settings.eventImageGiftEnabled,
          imageAssetId: settings.eventImageGiftAssetId || rule.imageAssetId,
          textEnabled: settings.eventTextGiftEnabled,
          textTemplate: settings.eventTextGiftTemplate || rule.textTemplate,
          textColor: settings.eventTextGiftColor,
          backgroundColor: settings.eventTextGiftBackgroundColor,
          borderColor: settings.eventTextGiftBorderColor,
          fontSize: settings.eventTextGiftFontSize,
          layout: settings.eventAlertGiftLayout,
          animationIn: settings.eventAlertGiftAnimationIn,
          animationOut: settings.eventAlertGiftAnimationOut,
          durationMs: settings.eventAlertGiftDurationMs,
          fontWeight: settings.eventAlertGiftFontWeight,
          textShadow: settings.eventAlertGiftTextShadow,
          imageTop: settings.eventAlertGiftImageTop,
          imageLeft: settings.eventAlertGiftImageLeft
        }
      }

      if (rule.id === 'default-follows') {
        return {
          ...rule,
          soundEnabled: settings.eventSoundFollowEnabled,
          soundId: settings.eventSoundFollowSoundId || rule.soundId,
          soundVolume: settings.eventSoundFollowVolume,
          imageEnabled: settings.eventImageFollowEnabled,
          imageAssetId: settings.eventImageFollowAssetId || rule.imageAssetId,
          textEnabled: settings.eventTextFollowEnabled,
          textTemplate: settings.eventTextFollowTemplate || rule.textTemplate,
          textColor: settings.eventTextFollowColor,
          backgroundColor: settings.eventTextFollowBackgroundColor,
          borderColor: settings.eventTextFollowBorderColor,
          fontSize: settings.eventTextFollowFontSize,
          layout: settings.eventAlertFollowLayout,
          animationIn: settings.eventAlertFollowAnimationIn,
          animationOut: settings.eventAlertFollowAnimationOut,
          durationMs: settings.eventAlertFollowDurationMs,
          fontWeight: settings.eventAlertFollowFontWeight,
          textShadow: settings.eventAlertFollowTextShadow,
          imageTop: settings.eventAlertFollowImageTop,
          imageLeft: settings.eventAlertFollowImageLeft
        }
      }

      if (rule.id === 'default-subs') {
        return {
          ...rule,
          soundEnabled: settings.eventSoundSuperfanEnabled,
          soundId: settings.eventSoundSuperfanSoundId || rule.soundId,
          soundVolume: settings.eventSoundSuperfanVolume,
          imageEnabled: settings.eventImageSuperfanEnabled,
          imageAssetId: settings.eventImageSuperfanAssetId || rule.imageAssetId,
          textEnabled: settings.eventTextSuperfanEnabled,
          textTemplate: settings.eventTextSuperfanTemplate || rule.textTemplate,
          textColor: settings.eventTextSuperfanColor,
          backgroundColor: settings.eventTextSuperfanBackgroundColor,
          borderColor: settings.eventTextSuperfanBorderColor,
          fontSize: settings.eventTextSuperfanFontSize,
          layout: settings.eventAlertSuperfanLayout,
          animationIn: settings.eventAlertSuperfanAnimationIn,
          animationOut: settings.eventAlertSuperfanAnimationOut,
          durationMs: settings.eventAlertSuperfanDurationMs,
          fontWeight: settings.eventAlertSuperfanFontWeight,
          textShadow: settings.eventAlertSuperfanTextShadow,
          imageTop: settings.eventAlertSuperfanImageTop,
          imageLeft: settings.eventAlertSuperfanImageLeft
        }
      }

      return rule
    })

    return { ...settings, alertRules }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
