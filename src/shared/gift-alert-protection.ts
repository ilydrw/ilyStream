import type { AnyStreamEvent, GiftEvent } from '../main/platforms/types'

export const LOW_VALUE_GIFT_ALERT_COOLDOWN_MS = 10_000
export const LOW_VALUE_GIFT_MAX_AMOUNT_CENTS = 5
export const LOW_VALUE_GIFT_MAX_COUNT = 5

export function isLowValueGiftAlertEvent(event: AnyStreamEvent): event is GiftEvent {
  if (event.type !== 'gift') return false
  if (event.platform !== 'tiktok') return false
  if (event.isCombo) return false
  if (Boolean((event.raw as any)?.simulated)) return false

  const giftCount = Math.max(1, Math.floor(Number(event.giftCount) || 1))
  const amountCents = Math.max(0, Math.floor(Number(event.monetaryValue) || 0))

  return giftCount <= LOW_VALUE_GIFT_MAX_COUNT && amountCents <= LOW_VALUE_GIFT_MAX_AMOUNT_CENTS
}

export class LowValueGiftCooldown {
  private lastFireAt = 0

  shouldSuppress(event: AnyStreamEvent, now = Date.now()): boolean {
    if (!isLowValueGiftAlertEvent(event)) return false

    if (this.lastFireAt > 0 && now - this.lastFireAt < LOW_VALUE_GIFT_ALERT_COOLDOWN_MS) {
      return true
    }

    this.lastFireAt = now
    return false
  }
}
