import type { AppSettings } from '../../shared/app-settings'
import type { AnyStreamEvent, JoinEvent } from '../platforms/types'
import type { SoundboardService } from './soundboard-service'
import type { OverlayServer } from '../overlay/overlay-server'

type AlertKind = 'Gift' | 'Follow' | 'Superfan'

const SUPERFAN_JOIN_DEDUPE_MS = 10 * 60 * 1000

export class EventSoundService {
  private settings: AppSettings | null = null
  private recentSuperfanJoinUsers = new Map<string, number>()
  private giftAggregationTimers = new Map<string, { count: number, timer: NodeJS.Timeout, lastEvent: AnyStreamEvent }>()

  constructor(
    private readonly soundboardService: Pick<SoundboardService, 'playSound' | 'stopAll'>,
    private readonly overlayServer: Pick<OverlayServer, 'pushAlert'>
  ) {}

  applySettings(settings: AppSettings): void {
    this.settings = { ...settings }
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
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
