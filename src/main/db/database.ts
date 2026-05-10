import BetterSqlite3 from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { AnyPlatformConfig, Platform } from '../platforms/types'
import { StatsRepository } from './repositories/StatsRepository'
import { GiftsRepository } from './repositories/GiftsRepository'
import { SCHEMA_SQL, runMigrations } from './schema'
import { seedTikTokGifts, seedActions, seedGlobalStats } from './seed'
import { rebuildAllStatsFromHistory } from './migrations'
import { 
  encryptConfig, 
  decryptConfig, 
  decodeSettingValue, 
  encodeSettingValue, 
  parseJson 
} from './utils'
import type { TikTokGiftInput, TikTokGiftRow } from './repositories/GiftsRepository'
import { VoiceProfile } from '../tts/voice-profiles'
import { TriggerRule } from '../triggers/trigger-types'

export type { TikTokGiftInput, TikTokGiftRow } from './repositories/GiftsRepository'

const EVENT_HISTORY_RETAIN_COUNT = 100_000

export interface UserStatRow {
  username: string
  platform: string
  display_name: string
  profile_picture_url: string | null
  total_likes: number
  total_gifts: number
  total_gift_value_cents: number
  total_subscriptions: number
  total_follows: number
  total_shares: number
  total_raids: number
  total_chats: number
  total_song_requests: number
  is_fan_club_member: number
  profile_id: string | null
  first_seen_at: string
  last_seen_at: string
}

export interface SoundMetadata {
  emoji?: string
}

export interface DeckActionRecord {
  id: string
  name: string
  icon: string
  color: string | null
  type: string
  payload_json: string
  sort_order: number
}

export class Database {
  private db: BetterSqlite3.Database
  public readonly stats: StatsRepository
  public readonly gifts: GiftsRepository

  constructor() {
    const dbPath = join(app.getPath('userData'), 'ilystream.db')
    this.db = new BetterSqlite3(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    this.stats = new StatsRepository(this.db)
    this.gifts = new GiftsRepository(this.db)

    this.init()
  }

  public getRawDb(): BetterSqlite3.Database { return this.db }

  private init(): void {
    this.db.exec(SCHEMA_SQL)
    runMigrations(this.db)
    seedTikTokGifts(this.db)
    seedActions(this.db)
    seedGlobalStats(this.db)

    // Retroactive Migrations
    try {
      if (!this.getSetting('migrated_stats_full_v12')) {
        const historyCount = (this.db.prepare('SELECT COUNT(*) as count FROM event_history').get() as any).count
        if (historyCount > 0) {
          console.log(`[db] Found ${historyCount} historical events. Rebuilding stats...`)
          rebuildAllStatsFromHistory(this.db)
        }
        this.setSetting('migrated_stats_full_v12', 'true')
      }
    } catch (err) { 
      console.error('[db] Stats rebuild failed:', err) 
    }
  }

  // Settings
  getSetting(key: string): unknown {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as any
    return row ? decodeSettingValue(key, parseJson(row.value_json, undefined)) : undefined
  }

  setSetting(key: string, value: unknown): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)').run(key, JSON.stringify(encodeSettingValue(key, value)))
  }

  getAllSettings(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value_json FROM settings').all() as any[]
    const settings: Record<string, unknown> = {}
    for (const row of rows) settings[row.key] = decodeSettingValue(row.key, parseJson(row.value_json, undefined))
    return settings
  }

  // Voice Profiles (could be moved to VoiceRepository)
  getAllVoiceProfiles(): VoiceProfile[] {
    const rows = this.db.prepare('SELECT * FROM voice_profiles ORDER BY is_default DESC, name ASC').all() as any[]
    return rows.map(row => ({
      id: row.id, name: row.name, provider: row.provider, voiceName: row.voice_name,
      kokoroVoice: row.kokoro_voice, lang: row.lang, pitch: row.pitch, rate: row.rate, volume: row.volume,
      effects: parseJson(row.effects_json, []), isDefault: row.is_default === 1,
      ...parseJson(row.meta_json, {})
    }))
  }

  saveVoiceProfile(p: VoiceProfile): void {
    if (p.isDefault) this.db.prepare('UPDATE voice_profiles SET is_default = 0').run()
    const { id, name, provider, voiceName, kokoroVoice, lang, pitch, rate, volume, effects, isDefault, ...meta } = p
    this.db.prepare(`
      INSERT OR REPLACE INTO voice_profiles (id, name, provider, voice_name, kokoro_voice, lang, pitch, rate, volume, effects_json, is_default, meta_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, provider, voiceName, kokoroVoice, lang, pitch, rate, volume, JSON.stringify(effects), isDefault ? 1 : 0, JSON.stringify(meta))
  }

  deleteVoiceProfile(id: string): void { this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(id) }

  // Triggers (could be moved to TriggerRepository)
  getAllTriggers(): TriggerRule[] {
    return (this.db.prepare('SELECT * FROM triggers ORDER BY sort_order').all() as any[]).map(row => ({
      id: row.id, name: row.name, enabled: row.enabled === 1,
      platforms: parseJson(row.platforms_json, []), conditions: parseJson(row.conditions_json, []),
      actions: parseJson(row.actions_json, []), cooldown: row.cooldown, userCooldown: row.user_cooldown, sortOrder: row.sort_order
    }))
  }

  saveTrigger(r: TriggerRule): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO triggers (id, name, enabled, platforms_json, conditions_json, actions_json, cooldown, user_cooldown, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(r.id, r.name, r.enabled ? 1 : 0, JSON.stringify(r.platforms), JSON.stringify(r.conditions), JSON.stringify(r.actions), r.cooldown, r.userCooldown, r.sortOrder)
  }

  deleteTrigger(id: string): void { this.db.prepare('DELETE FROM triggers WHERE id = ?').run(id) }

  // Widgets
  getAllWidgets(): any[] { return (this.db.prepare('SELECT * FROM widgets ORDER BY created_at').all() as any[]).map(r => ({ id: r.id, name: r.name, type: r.type, config: parseJson(r.config_json, {}) })) }
  saveWidget(w: any): void { this.db.prepare('INSERT OR REPLACE INTO widgets (id, name, type, config_json) VALUES (?, ?, ?, ?)').run(w.id, w.name, w.type, JSON.stringify(w.config)) }
  deleteWidget(id: string): void { this.db.prepare('DELETE FROM widgets WHERE id = ?').run(id) }

  // Sound metadata
  getAllSoundMetadata(): Record<string, SoundMetadata> {
    const rows = this.db.prepare('SELECT id, emoji FROM sounds_metadata').all() as Array<{ id: string; emoji: string | null }>
    const metadata: Record<string, SoundMetadata> = {}
    for (const row of rows) {
      metadata[row.id] = { emoji: row.emoji || undefined }
    }
    return metadata
  }

  getSoundEmoji(id: string): string | null {
    const row = this.db.prepare('SELECT emoji FROM sounds_metadata WHERE id = ?').get(id) as { emoji: string | null } | undefined
    return row?.emoji || null
  }

  setSoundEmoji(id: string, emoji: string | null): void {
    const trimmed = typeof emoji === 'string' ? emoji.trim() : ''
    if (!trimmed) {
      this.db.prepare('DELETE FROM sounds_metadata WHERE id = ?').run(id)
      return
    }

    this.db.prepare(`
      INSERT INTO sounds_metadata (id, emoji)
      VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET emoji = excluded.emoji
    `).run(id, trimmed)
  }

  // Deck actions
  getAllDeckActions(): DeckActionRecord[] {
    return this.db.prepare(`
      SELECT id, name, icon, color, type, payload_json, sort_order
      FROM deck_actions
      ORDER BY sort_order ASC, name ASC
    `).all() as DeckActionRecord[]
  }

  saveDeckAction(action: Partial<DeckActionRecord> & { payload?: unknown }): DeckActionRecord {
    const existing = action.id
      ? this.db.prepare('SELECT * FROM deck_actions WHERE id = ?').get(action.id) as DeckActionRecord | undefined
      : undefined

    const id = String(action.id || `action_${Date.now()}`)
    const name = String(action.name || existing?.name || 'New Action')
    const icon = String(action.icon || existing?.icon || 'Action')
    const color = action.color === undefined ? existing?.color ?? null : action.color || null
    const type = String(action.type || existing?.type || id)
    const payloadJson = typeof action.payload_json === 'string'
      ? action.payload_json
      : action.payload !== undefined
        ? JSON.stringify(action.payload)
        : existing?.payload_json || '{}'
    const sortOrder = Number.isFinite(Number(action.sort_order))
      ? Number(action.sort_order)
      : existing?.sort_order ?? this.getNextDeckActionSortOrder()

    this.db.prepare(`
      INSERT INTO deck_actions (id, name, icon, color, type, payload_json, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        icon = excluded.icon,
        color = excluded.color,
        type = excluded.type,
        payload_json = excluded.payload_json,
        sort_order = excluded.sort_order
    `).run(id, name, icon, color, type, payloadJson, sortOrder)

    return this.db.prepare(`
      SELECT id, name, icon, color, type, payload_json, sort_order
      FROM deck_actions
      WHERE id = ?
    `).get(id) as DeckActionRecord
  }

  deleteDeckAction(id: string): void {
    this.db.prepare('DELETE FROM deck_actions WHERE id = ?').run(id)
  }

  // Platform Configs
  getPlatformConfig(p: Platform): AnyPlatformConfig | null {
    const row = this.db.prepare('SELECT config_json, enabled FROM platform_configs WHERE platform = ?').get(p) as any
    return row ? { ...decryptConfig(parseJson(row.config_json, {})), platform: p, enabled: row.enabled === 1 } as AnyPlatformConfig : null
  }

  getAllPlatformConfigs(): AnyPlatformConfig[] {
    const rows = this.db.prepare('SELECT platform, config_json, enabled FROM platform_configs').all() as any[]
    return rows.map(row => ({
      ...decryptConfig(parseJson(row.config_json, {})),
      platform: row.platform as Platform,
      enabled: row.enabled === 1
    })) as AnyPlatformConfig[]
  }

  savePlatformConfig(c: AnyPlatformConfig): void {
    const { enabled, platform, ...rest } = c
    this.db.prepare('INSERT OR REPLACE INTO platform_configs (platform, config_json, enabled, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
      .run(platform, JSON.stringify(encryptConfig(rest as any)), enabled ? 1 : 0)
  }

  setPlatformEnabled(platform: Platform, enabled: boolean): void {
    const existing = this.getPlatformConfig(platform)
    if (existing) {
      this.savePlatformConfig({ ...existing, enabled } as AnyPlatformConfig)
      return
    }

    this.db.prepare(`
      INSERT INTO platform_configs (platform, config_json, enabled, updated_at)
      VALUES (?, '{}', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(platform) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
    `).run(platform, enabled ? 1 : 0)
  }

  addEvent(platform: string, eventType: string, userName: string | null, data: any): void {
    try {
      this.db.prepare(`
        INSERT INTO event_history (platform, event_type, user_name, data_json)
        VALUES (?, ?, ?, ?)
      `).run(platform, eventType, userName, JSON.stringify(data))
    } catch (err) {
      console.error('[db] Failed to add event to history:', err)
    }
  }

  pruneEventHistory(): void {
    try {
      // Keep a deeper raw event safety net so stats can be audited/recovered
      // without letting the database grow forever.
      this.db.prepare(`
        DELETE FROM event_history 
        WHERE id NOT IN (
          SELECT id FROM event_history 
          ORDER BY created_at DESC 
          LIMIT ?
        )
      `).run(EVENT_HISTORY_RETAIN_COUNT)
    } catch (err) {
      console.error('[db] Failed to prune event history:', err)
    }
  }

  // Stats
  getUserStat(p: string, u: string) { return this.stats.getUserStat(p, u) }
  getAllGlobalStats() { return this.stats.getAllGlobalStats() }
  incrementUserStats(s: any) { this.stats.incrementUserStats(s) }
  incrementGlobalStat(k: string, a: number) { this.stats.incrementGlobalStat(k, a) }
  getPlatformTotals(p: string) { return this.stats.getPlatformTotals(p) }
  getTopIdentities(o: any) { return this.stats.getTopIdentities(o) }
  linkAccounts(p1: string, u1: string, p2: string, u2: string) { this.stats.linkAccounts(p1, u1, p2, u2) }
  unlinkAccount(p: string, u: string) { this.stats.unlinkAccount(p, u) }

  // Gifts
  getTikTokGift(id: string) { return this.gifts.getTikTokGift(id) }
  getAllTikTokGifts(): TikTokGiftRow[] { return this.gifts.getAllTikTokGifts() }
  saveTikTokGift(gift: TikTokGiftInput) { this.gifts.saveTikTokGift(gift) }
  saveTikTokGiftCatalog(gifts: any[], source?: string) { return this.gifts.saveTikTokGiftCatalog(gifts, source) }

  fixTikTokStats(): void {
    rebuildAllStatsFromHistory(this.db)
  }

  close(): void { this.db.close() }

  private getNextDeckActionSortOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM deck_actions').get() as { next: number }
    return row.next
  }
}
