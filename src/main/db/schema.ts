import BetterSqlite3 from 'better-sqlite3'
import { DEFAULT_KOKORO_VOICE, DEFAULT_TTS_PROVIDER } from '../../shared/tts-providers'

export const SCHEMA_SQL = `
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

  CREATE TABLE IF NOT EXISTS global_stats (
    total_likes INTEGER DEFAULT 0,
    total_gifts INTEGER DEFAULT 0,
    total_gift_value_cents INTEGER DEFAULT 0,
    total_subscriptions INTEGER DEFAULT 0,
    total_follows INTEGER DEFAULT 0,
    total_shares INTEGER DEFAULT 0,
    total_raids INTEGER DEFAULT 0,
    total_chats INTEGER DEFAULT 0,
    total_song_requests INTEGER DEFAULT 0,
    peak_viewer_count INTEGER DEFAULT 0
  );

  -- Authoritative follower counts pulled from each platform's API
  -- (Twitch helix, TikTok roomInfo, YouTube channels.list, Kick API).
  -- These are NOT the same as user_stats.total_follows — that counts
  -- accounts who fired a 'follow' event during a session. This table is
  -- the actual lifetime audience number the platform reports.
  CREATE TABLE IF NOT EXISTS platform_follower_stats (
    platform TEXT PRIMARY KEY,
    follower_count INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Hourly snapshots of platform_follower_stats so we can compute growth
  -- deltas (Social Blade style: 24 h / 7 d / 30 d). One row per platform
  -- per hour; ON CONFLICT updates so the most recent reading in that hour wins.
  CREATE TABLE IF NOT EXISTS follower_snapshots (
    platform TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    follower_count INTEGER NOT NULL,
    PRIMARY KEY (platform, captured_at)
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
    profile_id TEXT,
    first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, platform)
  );

  CREATE INDEX IF NOT EXISTS idx_event_history_created ON event_history(created_at);
  CREATE INDEX IF NOT EXISTS idx_event_history_platform ON event_history(platform, event_type);
  CREATE INDEX IF NOT EXISTS idx_user_stats_likes ON user_stats(total_likes DESC);
  CREATE INDEX IF NOT EXISTS idx_user_stats_gift_value ON user_stats(total_gift_value_cents DESC);
  CREATE INDEX IF NOT EXISTS idx_user_stats_last_seen ON user_stats(last_seen_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_stats_profile_id ON user_stats(profile_id);
  CREATE INDEX IF NOT EXISTS idx_follower_snapshots_platform_time
    ON follower_snapshots(platform, captured_at DESC);
`

export function ensureColumn(db: BetterSqlite3.Database, table: string, column: string, definition: string): void {
  const t = table.trim()
  const c = column.trim()
  const ALLOWED_TABLES = new Set(['voice_profiles', 'triggers', 'platform_configs', 'settings', 'event_history', 'user_stats', 'global_stats', 'tiktok_gifts', 'tiktok_gift_aliases', 'economy_users', 'deck_actions', 'widgets', 'sounds_metadata'])
  const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/i
  if (!ALLOWED_TABLES.has(t) || !IDENTIFIER_RE.test(c)) throw new Error(`ensureColumn: Rejected invalid Table='${t}', Column='${c}'`)
  const rows = db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>
  if (rows.some((row) => row.name === c)) return
  console.log(`[db] Adding missing column: ${t}.${c}`)
  db.prepare(`ALTER TABLE ${t} ADD COLUMN ${c} ${definition}`).run()
}

export function runMigrations(db: BetterSqlite3.Database) {
  ensureColumn(db, 'voice_profiles', 'provider', `TEXT NOT NULL DEFAULT '${DEFAULT_TTS_PROVIDER}'`)
  ensureColumn(db, 'voice_profiles', 'kokoro_voice', `TEXT NOT NULL DEFAULT '${DEFAULT_KOKORO_VOICE}'`)
  ensureColumn(db, 'voice_profiles', 'meta_json', `TEXT NOT NULL DEFAULT '{}'`)

  // One-time data fix: prior versions allowed total_follows to climb past 1
  // when the same user fired multiple follow events (TikTok social spam,
  // Twitch follower backfill on every reconnect). A user can only "have
  // followed" once, so clamp anything > 1 back to 1. Cheap & idempotent.
  try {
    const clamped = db.prepare('UPDATE user_stats SET total_follows = 1 WHERE total_follows > 1').run()
    if (clamped.changes > 0) {
      console.log(`[db] Clamped ${clamped.changes} user_stats rows with inflated total_follows.`)
    }
  } catch (err) {
    console.warn('[db] Could not clamp inflated total_follows:', err)
  }
}
