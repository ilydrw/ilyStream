import BetterSqlite3 from 'better-sqlite3'
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { AnyPlatformConfig, Platform } from '../platforms/types'
import { TriggerRule } from '../triggers/trigger-types'
import { VoiceProfile } from '../tts/voice-profiles'
import { DEFAULT_KOKORO_VOICE, DEFAULT_TTS_PROVIDER } from '../../shared/tts-providers'
import { estimateTikTokCreatorGiftCents } from '../../shared/tiktok-revenue'

// Fields containing secrets that should be encrypted at rest.
// This list intentionally excludes public identifiers (username, channel, clientId, etc.)
const SENSITIVE_FIELDS = new Set([
  'sessionId',
  'signApiKey',
  'clientSecret',
  'accessToken',
  'refreshToken',
  'streamKey',
  'apiKey',
  'password',
  'obsPassword'
])

const SENSITIVE_SETTING_KEYS = new Set([
  'aiApiKey',
  'elevenlabsApiKey',
  'obsPassword',
  'spotifyAccessToken',
  'spotifyRefreshToken',
  'streamingStreamKey'
])

const ENC_PREFIX = 'enc:v1:'

/** Encrypt a single string value using the OS keychain. Returns the raw string if unavailable. */
function encryptField(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return value
  const encrypted = safeStorage.encryptString(value)
  return ENC_PREFIX + encrypted.toString('base64')
}

/** Decrypt a single string value. Handles both plaintext and enc:v1: prefixed values. */
function decryptField(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[db] safeStorage not available — cannot decrypt field')
    return value
  }
  try {
    const buf = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    console.error('[db] Failed to decrypt field:', (err as Error).message)
    return value
  }
}

/** Encrypt all sensitive fields in a config object (returns a new object). */
function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(config)) {
    out[key] = SENSITIVE_FIELDS.has(key) && typeof val === 'string' ? encryptField(val) : val
  }
  return out
}

/** Decrypt all sensitive fields in a config object (returns a new object). */
function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(config)) {
    out[key] = SENSITIVE_FIELDS.has(key) && typeof val === 'string' ? decryptField(val) : val
  }
  return out
}

export class Database {
  private db: BetterSqlite3.Database

  constructor() {
    const dbPath = join(app.getPath('userData'), 'ilystream.db')
    this.db = new BetterSqlite3(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.init()
  }

  public getRawDb(): BetterSqlite3.Database {
    return this.db
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS platform_configs (
        platform TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        enabled INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS voice_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'system',
        voice_name TEXT NOT NULL DEFAULT '',
        kokoro_voice TEXT NOT NULL DEFAULT 'af_heart',
        lang TEXT NOT NULL DEFAULT 'en-US',
        pitch REAL DEFAULT 1.0,
        rate REAL DEFAULT 1.0,
        volume REAL DEFAULT 1.0,
        effects_json TEXT DEFAULT '[]',
        is_default INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS triggers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        platforms_json TEXT DEFAULT '["tiktok","twitch","youtube","kick"]',
        conditions_json TEXT NOT NULL,
        actions_json TEXT NOT NULL,
        cooldown INTEGER DEFAULT 0,
        user_cooldown INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS event_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        event_type TEXT NOT NULL,
        user_name TEXT,
        data_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
 
      CREATE TABLE IF NOT EXISTS widgets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sounds_metadata (
        id TEXT PRIMARY KEY,
        emoji TEXT
      );

      CREATE TABLE IF NOT EXISTS economy_users (
        username TEXT,
        platform TEXT,
        points INTEGER DEFAULT 0,
        total_likes INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (username, platform)
      );

      CREATE TABLE IF NOT EXISTS deck_actions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT,
        type TEXT NOT NULL,
        payload_json TEXT DEFAULT '{}',
        sort_order INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS tiktok_gifts (
        gift_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        diamond_count INTEGER DEFAULT 0,
        image_url TEXT,
        name_key TEXT,
        source TEXT DEFAULT 'unknown',
        raw_json TEXT DEFAULT '{}',
        seen_count INTEGER DEFAULT 0,
        first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tiktok_gift_aliases (
        gift_id TEXT NOT NULL,
        alias_type TEXT NOT NULL,
        alias_value TEXT NOT NULL,
        first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        seen_count INTEGER DEFAULT 0,
        PRIMARY KEY (gift_id, alias_type, alias_value)
      );

      CREATE INDEX IF NOT EXISTS idx_event_history_created
        ON event_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_event_history_platform
        ON event_history(platform, event_type);
      CREATE TABLE IF NOT EXISTS global_stats (
        key TEXT PRIMARY KEY,
        value INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS user_stats (
        username TEXT,
        platform TEXT,
        display_name TEXT NOT NULL,
        profile_picture_url TEXT,
        total_likes INTEGER DEFAULT 0,
        total_gifts INTEGER DEFAULT 0,
        total_gift_value_cents INTEGER DEFAULT 0,
        total_subscriptions INTEGER DEFAULT 0,
        total_follows INTEGER DEFAULT 0,
        total_shares INTEGER DEFAULT 0,
        total_raids INTEGER DEFAULT 0,
        total_chats INTEGER DEFAULT 0,
        total_song_requests INTEGER DEFAULT 0,
        is_fan_club_member INTEGER DEFAULT 0,
        first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (username, platform)
      );

      CREATE INDEX IF NOT EXISTS idx_user_stats_likes
        ON user_stats(total_likes DESC);
      CREATE INDEX IF NOT EXISTS idx_user_stats_gift_value
        ON user_stats(total_gift_value_cents DESC);
      CREATE INDEX IF NOT EXISTS idx_user_stats_last_seen
        ON user_stats(last_seen_at DESC);
    `)

    this.ensureColumn('voice_profiles', 'provider', `TEXT NOT NULL DEFAULT '${DEFAULT_TTS_PROVIDER}'`)
    this.ensureColumn('voice_profiles', 'kokoro_voice', `TEXT NOT NULL DEFAULT '${DEFAULT_KOKORO_VOICE}'`)
    this.ensureColumn('voice_profiles', 'meta_json', `TEXT NOT NULL DEFAULT '{}'`)
    this.ensureColumn('user_stats', 'profile_picture_url', `TEXT`)
    this.ensureColumn('user_stats', 'total_gift_value_cents', `INTEGER DEFAULT 0`)
    this.ensureColumn('user_stats', 'total_subscriptions', `INTEGER DEFAULT 0`)
    this.ensureColumn('user_stats', 'total_follows', `INTEGER DEFAULT 0`)
    this.ensureColumn('user_stats', 'total_shares', `INTEGER DEFAULT 0`)
    this.ensureColumn('user_stats', 'total_raids', `INTEGER DEFAULT 0`)
    this.ensureColumn('user_stats', 'total_chats', `INTEGER DEFAULT 0`)
    this.ensureColumn('user_stats', 'total_song_requests', `INTEGER DEFAULT 0`)
    this.ensureColumn('user_stats', 'is_fan_club_member', `INTEGER DEFAULT 0`)
    this.ensureColumn('user_stats', 'first_seen_at', `TEXT`)
    this.ensureColumn('user_stats', 'last_seen_at', `TEXT`)
    this.ensureColumn('tiktok_gifts', 'name_key', `TEXT`)
    this.ensureColumn('tiktok_gifts', 'source', `TEXT DEFAULT 'unknown'`)
    this.ensureColumn('tiktok_gifts', 'raw_json', `TEXT DEFAULT '{}'`)
    this.ensureColumn('tiktok_gifts', 'seen_count', `INTEGER DEFAULT 0`)
    this.ensureColumn('tiktok_gifts', 'first_seen_at', `TEXT`)

    this.seedTikTokGifts()
    this.seedTriggers()
    this.seedActions()

    // --- Retroactive Migrations ---
    const migrationKey = 'migrated_tiktok_creator_revenue_v5'
    const alreadyMigrated = this.getSetting(migrationKey)
    if (!alreadyMigrated) {
      console.log('[db] Running retroactive TikTok revenue migration (Precise History Scan)...')
      try {
        this.fixTikTokStats()
        this.setSetting(migrationKey, true)
        console.log('[db] Migration successful.')
      } catch (err) {
        console.error('[db] Migration failed', err)
      }
    }

    // Migration: Fan Club Status
    const fanClubMigrationKey = 'migrated_tiktok_fan_club_v3'
    const fanClubMigrated = this.getSetting(fanClubMigrationKey)
    if (!fanClubMigrated) {
      console.log('[db] Running retroactive TikTok Fan Club status migration (v3)...')
      try {
        this.fixTikTokFanClubStatus()
        this.setSetting(fanClubMigrationKey, true)
        console.log('[db] Fan Club migration successful.')
      } catch (err) {
        console.error('[db] Fan Club migration failed', err)
      }
    }
  }

  private seedTikTokGifts(): void {
    const gifts = [
      { id: '5655', name: 'Rose', diamonds: 1 },
      { id: '8913', name: 'Rosa', diamonds: 1 },
      { id: '7934', name: 'Heart Me', diamonds: 1 },
      { id: '13651', name: 'Popular Vote', diamonds: 1 },
      { id: '6013', name: 'Go Popular', diamonds: 1 }
    ]

    const stmt = this.db.prepare(`
      INSERT INTO tiktok_gifts (gift_id, name, diamond_count)
      VALUES (?, ?, ?)
      ON CONFLICT(gift_id) DO UPDATE SET
        name = excluded.name,
        diamond_count = excluded.diamond_count
    `)

    for (const gift of gifts) {
      stmt.run(gift.id, gift.name, gift.diamonds)
    }
  }

  private seedActions(): void {
    const existing = this.db.prepare('SELECT COUNT(*) as n FROM deck_actions').get() as { n: number }
    if (existing.n > 0) return

    const defaults = [
      { id: 'KILL_TTS', name: 'Stop TTS', icon: '🔇', color: 'bg-red-500/20 text-red-400', type: 'DECK_ACTION' },
      { id: 'PHYSICS_DROP', name: 'Physics Drop', icon: '⚛️', color: 'bg-blue-500/20 text-blue-400', type: 'DECK_ACTION' },
      { id: 'SKIP_TRACK', name: 'Skip Song', icon: '⏭️', color: 'bg-green-500/20 text-green-400', type: 'DECK_ACTION' },
      { id: 'HUE_STRIKE', name: 'Hue Strobe', icon: '💡', color: 'bg-yellow-500/20 text-yellow-400', type: 'DECK_ACTION' },
      { id: 'HALVING', name: 'The Snap', icon: '🫰', color: 'bg-purple-500/20 text-purple-400', type: 'DECK_ACTION' },
      { id: 'POINTS_DROP', name: 'Points Drop', icon: '🪙', color: 'bg-amber-500/20 text-amber-400', type: 'DECK_ACTION' },
    ]

    const stmt = this.db.prepare(`
      INSERT INTO deck_actions (id, name, icon, color, type, payload_json, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    defaults.forEach((action, i) => {
      stmt.run(action.id, action.name, action.icon, action.color, action.type, '{}', i)
    })
  }

  private seedTriggers(): void {
    const existing = this.db.prepare('SELECT id FROM triggers WHERE name = ?').get('Super Fan Alert')
    if (existing) return

    const rule: TriggerRule = {
      id: 'super-fan-alert-default',
      name: 'Super Fan Alert',
      enabled: true,
      platforms: ['tiktok', 'twitch', 'youtube', 'kick'],
      conditions: [{ type: 'user_status', status: 'is_super_fan' }],
      actions: [
        {
          type: 'show_alert',
          template: '<div style="color: #FFD700; font-size: 24px; font-weight: bold;">⭐ SUPER FAN DETECTED ⭐</div><div style="font-size: 18px;">Welcome back, <strong>{username}</strong>!</div>',
          durationMs: 7000,
          animationIn: 'wave',
          animationOut: 'dissolve'
        } as any,
        {
          type: 'tts',
          template: 'Holy G! We got a super fan in the building! Everyone welcome {username} back to the stream!'
        } as any
      ],
      cooldown: 300,
      userCooldown: 0,
      sortOrder: -1
    }

    this.saveTrigger(rule)
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const t = table.trim()
    const c = column.trim()

    // Allowlist table and column names to prevent SQL injection from future callers
    const ALLOWED_TABLES = new Set(['voice_profiles', 'triggers', 'platform_configs', 'settings', 'event_history', 'user_stats', 'global_stats', 'tiktok_gifts', 'tiktok_gift_aliases', 'economy_users', 'deck_actions', 'widgets', 'sounds_metadata'])
    const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/i
    if (!ALLOWED_TABLES.has(t) || !IDENTIFIER_RE.test(c)) {
      throw new Error(`ensureColumn: Rejected invalid or unauthorized schema change: Table='${t}', Column='${c}'`)
    }

    const rows = this.db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>
    if (rows.some((row) => row.name === c)) return

    console.log(`[db] Adding missing column: ${t}.${c}`)
    this.db.prepare(`ALTER TABLE ${t} ADD COLUMN ${c} ${definition}`).run()
  }

  // --- Settings ---

  getSetting(key: string): unknown {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as any
    return row ? decodeSettingValue(key, parseJson(row.value_json, undefined)) : undefined
  }

  setSetting(key: string, value: unknown): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)'
    ).run(key, JSON.stringify(encodeSettingValue(key, value)))
  }

  getAllSettings(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value_json FROM settings').all() as any[]
    const settings: Record<string, unknown> = {}
    for (const row of rows) {
      settings[row.key] = decodeSettingValue(row.key, parseJson(row.value_json, undefined))
    }
    return settings
  }

  // --- Voice profiles ---

  getAllVoiceProfiles(): VoiceProfile[] {
    const rows = this.db.prepare(
      'SELECT * FROM voice_profiles ORDER BY is_default DESC, name ASC'
    ).all() as any[]

    return rows.map((row) => {
      const meta = parseJson<Record<string, unknown>>(row.meta_json || '{}', {})
      return {
        id: row.id,
        name: row.name,
        provider: row.provider || DEFAULT_TTS_PROVIDER,
        voiceName: row.voice_name,
        kokoroVoice: row.kokoro_voice || DEFAULT_KOKORO_VOICE,
        kokoroBlendVoice: typeof meta.kokoroBlendVoice === 'string' ? meta.kokoroBlendVoice : undefined,
        kokoroBlendWeight: typeof meta.kokoroBlendWeight === 'number' ? meta.kokoroBlendWeight : undefined,
        elevenlabsVoiceId: typeof meta.elevenlabsVoiceId === 'string' ? meta.elevenlabsVoiceId : undefined,
        elevenlabsStability: typeof meta.elevenlabsStability === 'number' ? meta.elevenlabsStability : undefined,
        elevenlabsSimilarity: typeof meta.elevenlabsSimilarity === 'number' ? meta.elevenlabsSimilarity : undefined,
        elevenlabsStyle: typeof meta.elevenlabsStyle === 'number' ? meta.elevenlabsStyle : undefined,
        lang: row.lang,
        pitch: row.pitch,
        rate: row.rate,
        volume: row.volume,
        effects: parseJson(row.effects_json || '[]', []),
        isDefault: row.is_default === 1
      }
    })
  }

  saveVoiceProfile(profile: VoiceProfile): void {
    if (profile.isDefault) {
      this.db.prepare('UPDATE voice_profiles SET is_default = 0').run()
    }

    const meta: Record<string, unknown> = {}
    if (profile.kokoroBlendVoice) meta.kokoroBlendVoice = profile.kokoroBlendVoice
    if (profile.kokoroBlendWeight !== undefined) meta.kokoroBlendWeight = profile.kokoroBlendWeight
    if (profile.elevenlabsVoiceId) meta.elevenlabsVoiceId = profile.elevenlabsVoiceId
    if (profile.elevenlabsStability !== undefined) meta.elevenlabsStability = profile.elevenlabsStability
    if (profile.elevenlabsSimilarity !== undefined) meta.elevenlabsSimilarity = profile.elevenlabsSimilarity
    if (profile.elevenlabsStyle !== undefined) meta.elevenlabsStyle = profile.elevenlabsStyle

    this.db.prepare(`
      INSERT OR REPLACE INTO voice_profiles
        (id, name, provider, voice_name, kokoro_voice, lang, pitch, rate, volume, effects_json, is_default, meta_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      profile.name,
      profile.provider ?? DEFAULT_TTS_PROVIDER,
      profile.voiceName,
      profile.kokoroVoice ?? DEFAULT_KOKORO_VOICE,
      profile.lang,
      profile.pitch,
      profile.rate,
      profile.volume,
      JSON.stringify(profile.effects),
      profile.isDefault ? 1 : 0,
      JSON.stringify(meta)
    )
  }

  deleteVoiceProfile(id: string): void {
    this.db.prepare('DELETE FROM voice_profiles WHERE id = ?').run(id)
  }

  // --- Triggers ---

  getAllTriggers(): TriggerRule[] {
    const rows = this.db.prepare('SELECT * FROM triggers ORDER BY sort_order').all() as any[]
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      enabled: row.enabled === 1,
      platforms: parseJson(row.platforms_json, ['tiktok', 'twitch', 'youtube', 'kick']),
      conditions: parseJson(row.conditions_json, []),
      actions: parseJson(row.actions_json, []),
      cooldown: row.cooldown,
      userCooldown: row.user_cooldown,
      sortOrder: row.sort_order
    }))
  }

  saveTrigger(rule: TriggerRule): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO triggers
        (id, name, enabled, platforms_json, conditions_json, actions_json, cooldown, user_cooldown, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rule.id,
      rule.name,
      rule.enabled ? 1 : 0,
      JSON.stringify(rule.platforms),
      JSON.stringify(rule.conditions),
      JSON.stringify(rule.actions),
      rule.cooldown,
      rule.userCooldown,
      rule.sortOrder
    )
  }

  deleteTrigger(id: string): void {
    this.db.prepare('DELETE FROM triggers WHERE id = ?').run(id)
  }
 
  // --- Widgets ---
 
  getAllWidgets(): any[] {
    const rows = this.db.prepare('SELECT * FROM widgets ORDER BY created_at').all() as any[]
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      config: parseJson(row.config_json, {})
    }))
  }

  getWidget(id: string): any | undefined {
    const row = this.db.prepare('SELECT * FROM widgets WHERE id = ?').get(id) as any
    if (!row) return undefined

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      config: parseJson(row.config_json, {})
    }
  }
 
  saveWidget(widget: { id: string; name: string; type: string; config: any }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO widgets (id, name, type, config_json)
      VALUES (?, ?, ?, ?)
    `).run(widget.id, widget.name, widget.type, JSON.stringify(widget.config))
  }
 
  deleteWidget(id: string): void {
    this.db.prepare('DELETE FROM widgets WHERE id = ?').run(id)
  }

  // --- Deck Actions ---
  
  getAllDeckActions(): any[] {
    return this.db.prepare('SELECT * FROM deck_actions ORDER BY sort_order ASC').all() as any[]
  }

  saveDeckAction(action: { id: string; name: string; icon: string; color?: string; type: string; payload?: any; sortOrder?: number }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO deck_actions (id, name, icon, color, type, payload_json, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      action.id,
      action.name,
      action.icon,
      action.color ?? null,
      action.type,
      JSON.stringify(action.payload ?? {}),
      action.sortOrder ?? 0
    )
  }

  deleteDeckAction(id: string): void {
    this.db.prepare('DELETE FROM deck_actions WHERE id = ?').run(id)
  }

  // --- Sounds Metadata ---

  getSoundEmoji(id: string): string | null {
    const row = this.db.prepare('SELECT emoji FROM sounds_metadata WHERE id = ?').get(id) as any
    return row ? row.emoji : null
  }

  setSoundEmoji(id: string, emoji: string | null): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO sounds_metadata (id, emoji) VALUES (?, ?)'
    ).run(id, emoji)
  }

  getAllSoundMetadata(): Record<string, { emoji: string }> {
    const rows = this.db.prepare('SELECT id, emoji FROM sounds_metadata').all() as any[]
    const metadata: Record<string, { emoji: string }> = {}
    for (const row of rows) {
      metadata[row.id] = { emoji: row.emoji }
    }
    return metadata
  }

  // --- Platform configs ---

  getPlatformConfig(platform: Platform): AnyPlatformConfig | null {
    const row = this.db.prepare(
      'SELECT config_json, enabled FROM platform_configs WHERE platform = ?'
    ).get(platform) as any
    if (!row) return null
    const raw = parseJson<Record<string, unknown>>(row.config_json, {})
    return {
      ...decryptConfig(raw),
      platform,
      enabled: row.enabled === 1
    } as AnyPlatformConfig
  }

  getAllPlatformConfigs(): Partial<Record<Platform, AnyPlatformConfig>> {
    const rows = this.db.prepare(
      'SELECT platform, config_json, enabled FROM platform_configs'
    ).all() as Array<{
      platform: Platform
      config_json: string
      enabled: number
    }>

    const configs: Partial<Record<Platform, AnyPlatformConfig>> = {}

    for (const row of rows) {
      const raw = parseJson<Record<string, unknown>>(row.config_json, {})
      configs[row.platform] = {
        ...decryptConfig(raw),
        platform: row.platform,
        enabled: row.enabled === 1
      } as AnyPlatformConfig
    }

    return configs
  }

  savePlatformConfig(config: AnyPlatformConfig): void {
    const { enabled, platform, ...configJson } = config
    const encrypted = encryptConfig(configJson as Record<string, unknown>)

    this.db.prepare(`
      INSERT OR REPLACE INTO platform_configs (platform, config_json, enabled, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(platform, JSON.stringify(encrypted), enabled ? 1 : 0)
  }

  setPlatformEnabled(platform: Platform, enabled: boolean): void {
    this.db.prepare(`
      UPDATE platform_configs
      SET enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE platform = ?
    `).run(enabled ? 1 : 0, platform)
  }

  // --- Event history ---

  addEvent(platform: string, eventType: string, userName: string | null, data: unknown): void {
    this.db.prepare(
      'INSERT INTO event_history (platform, event_type, user_name, data_json) VALUES (?, ?, ?, ?)'
    ).run(platform, eventType, userName, JSON.stringify(data))
  }

  getRecentEvents(limit = 100): unknown[] {
    return this.db.prepare(
      'SELECT * FROM event_history ORDER BY created_at DESC LIMIT ?'
    ).all(limit)
  }

  /**
   * Keep only the most recent `maxRows` rows in event_history.
   * Called periodically from the main process to prevent unbounded growth.
   */
  pruneEventHistory(maxRows = 10_000): void {
    this.db.prepare(`
      DELETE FROM event_history
      WHERE id NOT IN (
        SELECT id FROM event_history ORDER BY id DESC LIMIT ?
      )
    `).run(maxRows)
  }

  /**
   * Merge partial token fields (accessToken, refreshToken, expiresIn) into
   * an existing platform config without touching other settings.
   */
  updatePlatformTokens(
    platform: Platform,
    tokens: { accessToken?: string; refreshToken?: string; expiresIn?: number }
  ): void {
    const row = this.db.prepare(
      'SELECT config_json FROM platform_configs WHERE platform = ?'
    ).get(platform) as { config_json: string } | undefined
    if (!row) return

    // Decrypt existing, merge new tokens, re-encrypt
    const existing = decryptConfig(parseJson<Record<string, unknown>>(row.config_json, {}))
    const merged = { ...existing, ...tokens }
    const reEncrypted = encryptConfig(merged)
    this.db.prepare(
      'UPDATE platform_configs SET config_json = ?, updated_at = CURRENT_TIMESTAMP WHERE platform = ?'
    ).run(JSON.stringify(reEncrypted), platform)
  }

  // --- User stats (lifetime per-user, per-platform totals) ---

  /**
   * Increment any subset of the per-user counters in a single statement.
   * Creates the row if it doesn't exist and updates display_name /
   * profile_picture_url to the most recently observed values.
   */
  incrementUserStats(input: {
    username: string
    platform: string
    displayName?: string
    profilePictureUrl?: string | null
    likes?: number
    gifts?: number
    giftValueCents?: number
    subscriptions?: number
    follows?: number
    shares?: number
    raids?: number
    chats?: number
    songRequests?: number
    isFanClubMember?: boolean
  }): void {
    const username = (input.username || '').trim()
    if (!username) return

    const display = (input.displayName ?? username).trim() || username
    const pic = input.profilePictureUrl ?? null
    const likes = Math.max(0, Math.floor(input.likes ?? 0))
    const gifts = Math.max(0, Math.floor(input.gifts ?? 0))
    const giftValueCents = Math.max(0, Math.floor(input.giftValueCents ?? 0))
    const subscriptions = Math.max(0, Math.floor(input.subscriptions ?? 0))
    const follows = Math.max(0, Math.floor(input.follows ?? 0))
    const shares = Math.max(0, Math.floor(input.shares ?? 0))
    const raids = Math.max(0, Math.floor(input.raids ?? 0))
    const chats = Math.max(0, Math.floor(input.chats ?? 0))
    const songRequests = Math.max(0, Math.floor(input.songRequests ?? 0))

    this.db.prepare(`
      INSERT INTO user_stats (
        username, platform, display_name, profile_picture_url,
        total_likes, total_gifts, total_gift_value_cents, total_subscriptions,
        total_follows, total_shares, total_raids, total_chats, total_song_requests,
        is_fan_club_member,
        first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(username, platform) DO UPDATE SET
        display_name = CASE WHEN excluded.display_name <> '' THEN excluded.display_name ELSE user_stats.display_name END,
        profile_picture_url = COALESCE(excluded.profile_picture_url, user_stats.profile_picture_url),
        total_likes = user_stats.total_likes + excluded.total_likes,
        total_gifts = user_stats.total_gifts + excluded.total_gifts,
        total_gift_value_cents = user_stats.total_gift_value_cents + excluded.total_gift_value_cents,
        total_subscriptions = user_stats.total_subscriptions + excluded.total_subscriptions,
        total_follows = user_stats.total_follows + excluded.total_follows,
        total_shares = user_stats.total_shares + excluded.total_shares,
        total_raids = user_stats.total_raids + excluded.total_raids,
        total_chats = user_stats.total_chats + excluded.total_chats,
        total_song_requests = user_stats.total_song_requests + excluded.total_song_requests,
        is_fan_club_member = CASE WHEN excluded.is_fan_club_member IS NOT NULL THEN excluded.is_fan_club_member ELSE user_stats.is_fan_club_member END,
        last_seen_at = CURRENT_TIMESTAMP
    `).run(
      username,
      input.platform,
      display,
      pic,
      likes,
      gifts,
      giftValueCents,
      subscriptions,
      follows,
      shares,
      raids,
      chats,
      songRequests,
      input.isFanClubMember !== undefined ? (input.isFanClubMember ? 1 : 0) : null
    )
  }

  /** Read a single global counter (defaults to 0 when absent). */
  getGlobalStat(key: string): number {
    const row = this.db.prepare('SELECT value FROM global_stats WHERE key = ?').get(key) as
      | { value: number }
      | undefined
    return row?.value ?? 0
  }

  /** Atomically add `delta` to a global counter. */
  incrementGlobalStat(key: string, delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) return
    this.db.prepare(`
      INSERT INTO global_stats (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = value + excluded.value
    `).run(key, Math.floor(delta))
  }

  /** Set a global counter to `value` only when `value` is greater than the current. */
  setGlobalStatIfGreater(key: string, value: number): void {
    if (!Number.isFinite(value)) return
    this.db.prepare(`
      INSERT INTO global_stats (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = MAX(value, excluded.value)
    `).run(key, Math.floor(value))
  }

  /** Read all global counters as a map, used to assemble the dashboard payload. */
  getAllGlobalStats(): Record<string, number> {
    const rows = this.db.prepare('SELECT key, value FROM global_stats').all() as Array<{ key: string; value: number }>
    const out: Record<string, number> = {}
    for (const row of rows) out[row.key] = row.value
    return out
  }

  /** Number of unique (username, platform) pairs we've seen, optionally scoped to one platform. */
  getUniqueUserCount(platform?: string): number {
    const row = platform
      ? (this.db.prepare('SELECT COUNT(*) as n FROM user_stats WHERE platform = ?').get(platform) as { n: number })
      : (this.db.prepare('SELECT COUNT(*) as n FROM user_stats').get() as { n: number })
    return row?.n ?? 0
  }

  /** Aggregated platform totals, used to build the per-platform breakdown. */
  getPlatformTotals(platform: string): {
    totalLikes: number
    totalGifts: number
    totalGiftValueCents: number
    totalSubscriptions: number
    totalFollows: number
    totalShares: number
    totalRaids: number
    totalChats: number
    totalSongRequests: number
    uniqueUserCount: number
  } {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(total_likes), 0) as totalLikes,
        COALESCE(SUM(total_gifts), 0) as totalGifts,
        COALESCE(SUM(total_gift_value_cents), 0) as totalGiftValueCents,
        COALESCE(SUM(total_subscriptions), 0) as totalSubscriptions,
        COALESCE(SUM(total_follows), 0) as totalFollows,
        COALESCE(SUM(total_shares), 0) as totalShares,
        COALESCE(SUM(total_raids), 0) as totalRaids,
        COALESCE(SUM(total_chats), 0) as totalChats,
        COALESCE(SUM(total_song_requests), 0) as totalSongRequests,
        COUNT(*) as uniqueUserCount
      FROM user_stats
      WHERE platform = ?
    `).get(platform) as any
    return {
      totalLikes: row?.totalLikes ?? 0,
      totalGifts: row?.totalGifts ?? 0,
      totalGiftValueCents: row?.totalGiftValueCents ?? 0,
      totalSubscriptions: row?.totalSubscriptions ?? 0,
      totalFollows: row?.totalFollows ?? 0,
      totalShares: row?.totalShares ?? 0,
      totalRaids: row?.totalRaids ?? 0,
      totalChats: row?.totalChats ?? 0,
      totalSongRequests: row?.totalSongRequests ?? 0,
      uniqueUserCount: row?.uniqueUserCount ?? 0
    }
  }

  /**
   * Read a page of users sorted by the requested column. The column whitelist
   * keeps us safe from SQL injection without giving up dynamic ORDER BY.
   */
  getTopUsers(opts: {
    sortColumn: string
    platform?: string
    query?: string
    limit: number
    offset: number
  }): UserStatRow[] {
    const ALLOWED_SORT = new Set([
      'total_likes',
      'total_gifts',
      'total_gift_value_cents',
      'total_subscriptions',
      'total_follows',
      'total_shares',
      'total_raids',
      'total_chats',
      'total_song_requests',
      'last_seen_at'
    ])
    const sortColumn = ALLOWED_SORT.has(opts.sortColumn) ? opts.sortColumn : 'total_likes'

    const where: string[] = []
    const params: unknown[] = []
    if (opts.platform) {
      where.push('platform = ?')
      params.push(opts.platform)
    }
    if (opts.query && opts.query.trim().length > 0) {
      where.push('(LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)')
      const like = `%${opts.query.trim().toLowerCase()}%`
      params.push(like, like)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const limit = Math.min(500, Math.max(1, Math.floor(opts.limit)))
    const offset = Math.max(0, Math.floor(opts.offset))

    return this.db.prepare(`
      SELECT * FROM user_stats
      ${whereSql}
      ORDER BY ${sortColumn} DESC, last_seen_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as UserStatRow[]
  }

  getUserStat(platform: string, username: string): UserStatRow | null {
    const row = this.db.prepare(
      'SELECT * FROM user_stats WHERE platform = ? AND LOWER(username) = LOWER(?)'
    ).get(platform, username) as UserStatRow | undefined
    return row ?? null
  }

  /** Wipe all stats counters. Used by the "Reset stats" button on the page. */
  resetAllStats(): void {
    this.db.prepare('DELETE FROM user_stats').run()
    this.db.prepare('DELETE FROM global_stats').run()
  }

  // --- TikTok Gifts ---
  
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

  getAllTikTokGifts(): any[] {
    return this.db.prepare('SELECT * FROM tiktok_gifts ORDER BY diamond_count DESC').all() as any[]
  }

  /**
   * Retroactively recalculates TikTok gift and subscription revenue from event history.
   * This ensures precise accuracy based on diamond counts and subscription events.
   */
  fixTikTokStats(): void {
    // 1. Reset TikTok gift/subscription stats before rebuilding from event history
    this.db.prepare(`
      UPDATE user_stats 
      SET total_gifts = 0,
          total_gift_value_cents = 0,
          total_subscriptions = 0
      WHERE platform = 'tiktok'
    `).run()

    // 2. Scan event_history for TikTok gifts and subscriptions
    const events = this.db.prepare(`
      SELECT id, user_name, event_type, data_json, created_at
      FROM event_history 
      WHERE platform = 'tiktok' AND (event_type = 'gift' OR event_type = 'subscription')
      ORDER BY created_at ASC, id ASC
    `).all() as Array<{ id: number; user_name: string | null; event_type: string; data_json: string; created_at: string | null }>

    const giftTotals = new Map<string, { gifts: number; cents: number }>()
    const snapshotBursts = new Map<string, { username: string; diamondCount: number; lastAt: number }>()
    const snapshotBurstMs = 15_000

    const addGift = (username: string, giftCount: number, diamondCount: number): void => {
      const key = username.toLowerCase()
      const existing = giftTotals.get(key) ?? { gifts: 0, cents: 0 }
      const count = Math.max(1, Math.floor(giftCount || 1))
      existing.gifts += count
      existing.cents += estimateTikTokCreatorGiftCents(diamondCount, count)
      giftTotals.set(key, existing)
    }

    const flushSnapshotBurst = (key: string): void => {
      const burst = snapshotBursts.get(key)
      if (!burst) return
      // Older TikTok history stored every streak update as a separate event
      // with no repeatEnd flag. Count that burst once instead of counting
      // cumulative snapshots like separate gifts.
      addGift(burst.username, 1, burst.diamondCount)
      snapshotBursts.delete(key)
    }

    for (const event of events) {
      try {
        const data = JSON.parse(event.data_json)

        if (event.event_type === 'gift') {
          let diamondCount = data.diamondCount || 0
          const repeatCount = data.giftCount || data.repeatCount || 1
          const username = resolveHistoricalEventUsername(event.user_name, data)
          if (!username) continue
          
          // Resolve from the local catalog only when the name also matches.
          // TikTok gift IDs can drift; a stale seed once mapped Rose to
          // Interstellar and inflated stats by thousands of diamonds.
          if (diamondCount === 0 && data.giftId) {
            const dbGift = this.getTikTokGift(String(data.giftId))
            if (dbGift && giftNamesMatch(dbGift.name, data.giftName)) diamondCount = dbGift.diamond_count
          }

          if (data.repeatEnd === false) continue

          if (data.repeatEnd == null) {
            const giftId = String(data.giftId || data.giftName || 'unknown')
            const giftName = String(data.giftName || giftId)
            const burstKey = `${username.toLowerCase()}:${giftId}:${normalizeGiftName(giftName)}`
            const at = Date.parse(event.created_at || '') || 0
            const existing = snapshotBursts.get(burstKey)

            if (existing && at > 0 && existing.lastAt > 0 && at - existing.lastAt > snapshotBurstMs) {
              flushSnapshotBurst(burstKey)
            }

            snapshotBursts.set(burstKey, {
              username,
              diamondCount,
              lastAt: at || existing?.lastAt || 0
            })
            continue
          }

          addGift(username, repeatCount, diamondCount)
        } else if (event.event_type === 'subscription') {
          const username = resolveHistoricalEventUsername(event.user_name, data)
          if (!username || isLocalAlertTestUser(username)) continue
          // Standardize TikTok subscriptions to $4.99 (499 cents)
          this.db.prepare(`
            UPDATE user_stats 
            SET total_subscriptions = total_subscriptions + 1,
                total_gift_value_cents = total_gift_value_cents + 499
            WHERE LOWER(username) = LOWER(?) AND platform = 'tiktok'
          `).run(username)
        }
      } catch (err) {
        console.error('[db] Failed to process historical event for fix', err)
      }
    }

    for (const key of Array.from(snapshotBursts.keys())) {
      flushSnapshotBurst(key)
    }

    const updateGiftTotals = this.db.prepare(`
      UPDATE user_stats 
      SET total_gifts = total_gifts + ?,
          total_gift_value_cents = total_gift_value_cents + ?
      WHERE LOWER(username) = LOWER(?) AND platform = 'tiktok'
    `)

    for (const [username, total] of giftTotals) {
      updateGiftTotals.run(total.gifts, total.cents, username)
    }

    // 3. Rebuild global totals from corrected individual user totals
    this.db.prepare(`
      INSERT INTO global_stats (key, value)
      VALUES ('totalGifts', (SELECT COALESCE(SUM(total_gifts), 0) FROM user_stats))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run()

    this.db.prepare(`
      INSERT INTO global_stats (key, value)
      VALUES ('totalSubscriptions', (SELECT COALESCE(SUM(total_subscriptions), 0) FROM user_stats))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run()

    this.db.prepare(`
      INSERT INTO global_stats (key, value)
      VALUES ('totalGiftValueCents', (SELECT COALESCE(SUM(total_gift_value_cents), 0) FROM user_stats))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run()
  }

  /**
   * Retroactively identifies TikTok Fan Club members from event history.
   */
  fixTikTokFanClubStatus(): void {
    const events = this.db.prepare(`
      SELECT user_name, data_json 
      FROM event_history 
      WHERE platform = 'tiktok'
    `).all() as Array<{ user_name: string; data_json: string }>

    const fanClubUsers = new Set<string>()

    for (const event of events) {
      try {
        const data = JSON.parse(event.data_json)
        const isFan = data.isFanClubMember === true || (data.user && data.user.isFanClubMember === true)
        
        if (isFan) {
          const username = data.user?.username || data.username || event.user_name
          if (username) {
            fanClubUsers.add(username.toLowerCase().trim())
          }
        }
      } catch (err) {
        // Skip malformed JSON
      }
    }

    if (fanClubUsers.size > 0) {
      const stmt = this.db.prepare(`
        UPDATE user_stats 
        SET is_fan_club_member = 1 
        WHERE LOWER(username) = LOWER(?) AND platform = 'tiktok'
      `)
      
      const transaction = this.db.transaction((users: string[]) => {
        for (const username of users) {
          stmt.run(username)
        }
      })
      
      transaction(Array.from(fanClubUsers))
      console.log(`[db] Retroactively identified ${fanClubUsers.size} TikTok Fan Club members.`)
    }
  }

  /**
   * Removes a specific user's stats and subtracts their totals from the global counters.
   */
  purgeUserStats(username: string): void {
    const users = this.db.prepare('SELECT * FROM user_stats WHERE username = ?').all(username) as any[]
    if (users.length === 0) return

    for (const user of users) {
      this.incrementGlobalStat('totalLikes', -(user.total_likes || 0))
      this.incrementGlobalStat('totalGifts', -(user.total_gifts || 0))
      this.incrementGlobalStat('totalGiftValueCents', -(user.total_gift_value_cents || 0))
      this.incrementGlobalStat('totalSubscriptions', -(user.total_subscriptions || 0))
      this.incrementGlobalStat('totalFollows', -(user.total_follows || 0))
      this.incrementGlobalStat('totalShares', -(user.total_shares || 0))
      this.incrementGlobalStat('totalRaids', -(user.total_raids || 0))
      this.incrementGlobalStat('totalChats', -(user.total_chats || 0))
      this.incrementGlobalStat('totalSongRequests', -(user.total_song_requests || 0))
    }

    this.db.prepare('DELETE FROM user_stats WHERE username = ?').run(username)
  }

  close(): void {
    this.db.close()
  }
}

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
  first_seen_at: string
  last_seen_at: string
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
  first_seen_at: string | null
  last_seen_at: string | null
}

export interface TikTokGiftInput {
  gift_id: string
  name: string
  diamond_count: number
  image_url?: string | null
  name_key?: string | null
  source?: string
  raw?: unknown
  aliases?: string[]
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function encodeSettingValue(key: string, value: unknown): unknown {
  if (!SENSITIVE_SETTING_KEYS.has(key) || typeof value !== 'string' || value.length === 0) {
    return value
  }

  return encryptField(value)
}

function decodeSettingValue(key: string, value: unknown): unknown {
  if (!SENSITIVE_SETTING_KEYS.has(key) || typeof value !== 'string') {
    return value
  }

  return decryptField(value)
}

function resolveHistoricalEventUsername(userName: string | null | undefined, data: any): string {
  const candidates = [
    userName,
    data?.username,
    data?.userName,
    data?.uniqueId,
    data?.user?.username,
    data?.user?.userName,
    data?.user?.uniqueId,
    data?.user?.nickname
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const normalized = candidate.trim()
    if (normalized) return normalized
  }

  return ''
}

function normalizeGiftName(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function giftNamesMatch(catalogName: unknown, eventName: unknown): boolean {
  const normalizedCatalog = normalizeGiftName(catalogName)
  const normalizedEvent = normalizeGiftName(eventName)
  return Boolean(normalizedCatalog && normalizedEvent && normalizedCatalog === normalizedEvent)
}

function isLocalAlertTestUser(username: string): boolean {
  return username.trim().toLowerCase() === 'local alert test'
}
