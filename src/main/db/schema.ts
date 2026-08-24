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
    provider TEXT NOT NULL DEFAULT 'kokoro',
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
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    total_likes INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, platform)
  );

  CREATE TABLE IF NOT EXISTS economy_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    platform TEXT NOT NULL,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    kind TEXT NOT NULL,
    reason TEXT NOT NULL,
    reference_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS economy_redemptions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    cost INTEGER NOT NULL,
    min_level INTEGER NOT NULL DEFAULT 1,
    cooldown_seconds INTEGER NOT NULL DEFAULT 30,
    action_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS economy_redemption_uses (
    id TEXT PRIMARY KEY,
    redemption_id TEXT NOT NULL,
    username TEXT NOT NULL,
    platform TEXT NOT NULL,
    cost INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (redemption_id) REFERENCES economy_redemptions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS economy_daily_claims (
    username TEXT NOT NULL,
    platform TEXT NOT NULL,
    claim_date TEXT NOT NULL,
    streak INTEGER NOT NULL DEFAULT 1,
    reward INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, platform, claim_date)
  );

  CREATE TABLE IF NOT EXISTS stream_state (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    peak_viewer_count INTEGER DEFAULT 0,
    total_cohost_calls INTEGER DEFAULT 0
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
    platform_user_id TEXT,
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
    is_super_fan INTEGER DEFAULT 0,
    is_moderator INTEGER DEFAULT 0,
    moderator_badge_image_url TEXT,
    tiktok_fan_club_badge_image_url TEXT,
    tiktok_super_fan_badge_image_url TEXT,
    twitch_sub_badge_image_url TEXT,
    youtube_super_fan_badge_image_url TEXT,
    profile_id TEXT,
    total_cohost_calls INTEGER DEFAULT 0,
    first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, platform)
  );

  CREATE TABLE IF NOT EXISTS viewer_profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    profile_picture_url TEXT,
    notes TEXT DEFAULT '',
    primary_platform TEXT,
    primary_username TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS viewer_accounts (
    profile_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    username TEXT NOT NULL,
    platform_user_id TEXT,
    display_name TEXT NOT NULL,
    profile_picture_url TEXT,
    first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (platform, username)
  );

  CREATE INDEX IF NOT EXISTS idx_event_history_created ON event_history(created_at);
  CREATE INDEX IF NOT EXISTS idx_event_history_platform ON event_history(platform, event_type);
  CREATE INDEX IF NOT EXISTS idx_user_stats_likes ON user_stats(total_likes DESC);
  CREATE INDEX IF NOT EXISTS idx_user_stats_gift_value ON user_stats(total_gift_value_cents DESC);
  CREATE INDEX IF NOT EXISTS idx_user_stats_last_seen ON user_stats(last_seen_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_stats_profile_id ON user_stats(profile_id);
  CREATE INDEX IF NOT EXISTS idx_user_stats_platform_user_id ON user_stats(platform, platform_user_id);
  CREATE INDEX IF NOT EXISTS idx_user_stats_owner_nocase ON user_stats(platform, username COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_viewer_accounts_profile_id ON viewer_accounts(profile_id);
  CREATE INDEX IF NOT EXISTS idx_viewer_accounts_platform_user_id ON viewer_accounts(platform, platform_user_id);
  CREATE INDEX IF NOT EXISTS idx_follower_snapshots_platform_time
    ON follower_snapshots(platform, captured_at DESC);
  CREATE INDEX IF NOT EXISTS idx_economy_users_owner_nocase
    ON economy_users(platform, username COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_economy_transactions_user_time
    ON economy_transactions(platform, username, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_economy_transactions_time
    ON economy_transactions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_economy_redemption_uses_cooldown
    ON economy_redemption_uses(redemption_id, platform, username, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_economy_redemption_uses_owner_nocase
    ON economy_redemption_uses(redemption_id, platform, username COLLATE NOCASE, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_economy_daily_claims_owner_nocase
    ON economy_daily_claims(platform, username COLLATE NOCASE, claim_date DESC);
`

export function ensureColumn(db: BetterSqlite3.Database, table: string, column: string, definition: string): void {
  const t = table.trim()
  const c = column.trim()
  const ALLOWED_TABLES = new Set(['voice_profiles', 'triggers', 'platform_configs', 'settings', 'event_history', 'user_stats', 'global_stats', 'tiktok_gifts', 'tiktok_gift_aliases', 'economy_users', 'stream_state', 'deck_actions', 'widgets', 'sounds_metadata', 'viewer_profiles', 'viewer_accounts'])
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
  ensureColumn(db, 'economy_users', 'xp', 'INTEGER DEFAULT 0')
  ensureColumn(db, 'economy_users', 'level', 'INTEGER DEFAULT 1')
  ensureColumn(db, 'user_stats', 'platform_user_id', 'TEXT')
  ensureColumn(db, 'user_stats', 'is_super_fan', 'INTEGER DEFAULT 0')
  ensureColumn(db, 'user_stats', 'is_moderator', 'INTEGER DEFAULT 0')
  ensureColumn(db, 'user_stats', 'moderator_badge_image_url', 'TEXT')
  ensureColumn(db, 'user_stats', 'tiktok_fan_club_badge_image_url', 'TEXT')
  ensureColumn(db, 'user_stats', 'tiktok_super_fan_badge_image_url', 'TEXT')
  ensureColumn(db, 'user_stats', 'twitch_sub_badge_image_url', 'TEXT')
  ensureColumn(db, 'user_stats', 'youtube_super_fan_badge_image_url', 'TEXT')
  ensureColumn(db, 'user_stats', 'total_cohost_calls', 'INTEGER DEFAULT 0')
  ensureColumn(db, 'global_stats', 'total_cohost_calls', 'INTEGER DEFAULT 0')
  ensureColumn(db, 'viewer_profiles', 'profile_picture_url', 'TEXT')
  ensureColumn(db, 'viewer_profiles', 'notes', "TEXT DEFAULT ''")
  ensureColumn(db, 'viewer_profiles', 'primary_platform', 'TEXT')
  ensureColumn(db, 'viewer_profiles', 'primary_username', 'TEXT')
  ensureColumn(db, 'viewer_profiles', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP')
  ensureColumn(db, 'viewer_profiles', 'updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP')
  ensureColumn(db, 'viewer_accounts', 'platform_user_id', 'TEXT')
  ensureColumn(db, 'viewer_accounts', 'display_name', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'viewer_accounts', 'profile_picture_url', 'TEXT')
  ensureColumn(db, 'viewer_accounts', 'first_seen_at', 'TEXT DEFAULT CURRENT_TIMESTAMP')
  ensureColumn(db, 'viewer_accounts', 'last_seen_at', 'TEXT DEFAULT CURRENT_TIMESTAMP')

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
