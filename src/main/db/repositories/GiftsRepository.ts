import { BaseRepository } from './BaseRepository'

export interface TikTokGiftInput {
  gift_id: number | string
  name: string
  diamond_count: number
  image_url?: string
  name_key?: string
  source?: string
  raw?: any
  aliases?: string[]
}

export interface TikTokGiftRow {
  gift_id: string
  name: string
  diamond_count: number
  image_url?: string
  name_key?: string
  source: string
  raw_json: string
  seen_count: number
  first_seen_at: string
  last_seen_at: string
}

export class GiftsRepository extends BaseRepository {
  getTikTokGift(id: string): TikTokGiftRow | null {
    const row = this.db.prepare('SELECT * FROM tiktok_gifts WHERE gift_id = ?').get(id) as any
    return row ? {
      gift_id: row.gift_id,
      name: row.name,
      diamond_count: row.diamond_count,
      image_url: row.image_url || undefined,
      name_key: row.name_key || undefined,
      source: row.source || 'unknown',
      raw_json: row.raw_json || '{}',
      seen_count: row.seen_count || 0,
      first_seen_at: row.first_seen_at || null,
      last_seen_at: row.last_seen_at || null
    } : null
  }

  saveTikTokGift(gift: TikTokGiftInput): void {
    const giftId = String(gift.gift_id || '').trim()
    const name = String(gift.name || '').trim()
    if (!giftId || !name) return

    const diamondCount = Math.max(0, Math.floor(Number(gift.diamond_count) || 0))
    const rawJson = JSON.stringify(gift.raw ?? {})
    const source = gift.source || 'event'

    this.db.prepare(`
      INSERT INTO tiktok_gifts (
        gift_id, name, diamond_count, image_url, name_key, source, raw_json,
        seen_count, first_seen_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(gift_id) DO UPDATE SET
        name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE tiktok_gifts.name END,
        diamond_count = CASE WHEN excluded.diamond_count > 0 THEN excluded.diamond_count ELSE tiktok_gifts.diamond_count END,
        image_url = COALESCE(excluded.image_url, tiktok_gifts.image_url),
        name_key = COALESCE(excluded.name_key, tiktok_gifts.name_key),
        source = CASE
          WHEN excluded.diamond_count > 0 THEN excluded.source
          ELSE tiktok_gifts.source
        END,
        raw_json = CASE WHEN excluded.raw_json <> '{}' THEN excluded.raw_json ELSE tiktok_gifts.raw_json END,
        seen_count = tiktok_gifts.seen_count + 1,
        last_seen_at = CURRENT_TIMESTAMP
    `).run(
      giftId,
      name,
      diamondCount,
      gift.image_url || null,
      gift.name_key || null,
      source,
      rawJson
    )

    const aliases = new Set<string>([
      name,
      gift.name_key || '',
      ...(gift.aliases ?? [])
    ])

    for (const alias of aliases) {
      const normalized = String(alias || '').trim()
      if (!normalized) continue
      this.saveTikTokGiftAlias(giftId, normalized.includes('live_gift_') ? 'name_key' : 'name', normalized)
    }
  }

  saveTikTokGiftCatalog(gifts: TikTokGiftInput[], source = 'available-gifts'): number {
    const transaction = this.db.transaction((items: TikTokGiftInput[]) => {
      for (const gift of items) this.saveTikTokGift({ ...gift, source: gift.source || source })
    })
    transaction(gifts)
    return gifts.length
  }

  private saveTikTokGiftAlias(giftId: string, aliasType: string, aliasValue: string): void {
    this.db.prepare(`
      INSERT INTO tiktok_gift_aliases (gift_id, alias_type, alias_value, seen_count, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(gift_id, alias_type, alias_value) DO UPDATE SET
        seen_count = tiktok_gift_aliases.seen_count + 1,
        last_seen_at = CURRENT_TIMESTAMP
    `).run(giftId, aliasType, aliasValue)
  }

  getAllTikTokGifts(): TikTokGiftRow[] {
    return this.db.prepare('SELECT * FROM tiktok_gifts ORDER BY diamond_count DESC').all() as TikTokGiftRow[]
  }
}
