export const TIKTOK_CREATOR_CENTS_PER_DIAMOND = 0.5

export function estimateTikTokCreatorGiftCents(diamondCount: number, repeatCount = 1): number {
  const diamonds = Math.max(0, Math.floor(Number(diamondCount) || 0))
  const repeats = Math.max(1, Math.floor(Number(repeatCount) || 1))
  return Math.floor(diamonds * repeats * TIKTOK_CREATOR_CENTS_PER_DIAMOND)
}
