import BetterSqlite3 from 'better-sqlite3'
import { estimateTikTokCreatorGiftCents } from '../../shared/tiktok-revenue'

interface RebuildOptions {
  force?: boolean
}

const PRUNED_HISTORY_THRESHOLD = 10_000

export function rebuildAllStatsFromHistory(db: BetterSqlite3.Database, options: RebuildOptions = {}): void {
  console.log('[db] Starting comprehensive stats rebuild from event_history...')

  const historyCount = (db.prepare('SELECT COUNT(*) as count FROM event_history').get() as { count: number }).count
  const existingUserCount = (db.prepare('SELECT COUNT(*) as count FROM user_stats').get() as { count: number }).count
  const isProbablyPruned = historyCount >= PRUNED_HISTORY_THRESHOLD

  if (!options.force && isProbablyPruned && existingUserCount > 0) {
    console.warn(
      `[db] Skipping stats rebuild because event_history has exactly/at least ${PRUNED_HISTORY_THRESHOLD} rows and user_stats is not empty. ` +
      'That means history may be pruned, so rebuilding would erase older lifetime totals.'
    )
    return
  }

  // 1. Reset everything
  db.prepare('DELETE FROM user_stats').run()
  db.prepare('DELETE FROM global_stats').run()
  db.prepare('INSERT INTO global_stats (total_likes) VALUES (0)').run()

  // 2. Fetch ALL events in chronological order
  const events = db.prepare(`
    SELECT platform, event_type, user_name, data_json, created_at
    FROM event_history 
    ORDER BY created_at ASC
  `).all() as Array<{ 
    platform: string; 
    event_type: string; 
    user_name: string | null; 
    data_json: string; 
    created_at: string | null 
  }>

  console.log(`[db] Found ${events.length} events in history to process.`)

  const insertUser = db.prepare(`
    INSERT INTO user_stats (
      username, platform, display_name, profile_picture_url, is_fan_club_member,
      total_likes, total_gifts, total_gift_value_cents, total_subscriptions, 
      total_follows, total_shares, total_raids, total_chats, total_song_requests,
      first_seen_at, last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username, platform) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, user_stats.display_name),
      profile_picture_url = COALESCE(excluded.profile_picture_url, user_stats.profile_picture_url),
      is_fan_club_member = CASE WHEN excluded.is_fan_club_member = 1 THEN 1 ELSE user_stats.is_fan_club_member END,
      total_likes = user_stats.total_likes + excluded.total_likes,
      total_gifts = user_stats.total_gifts + excluded.total_gifts,
      total_gift_value_cents = user_stats.total_gift_value_cents + excluded.total_gift_value_cents,
      total_subscriptions = user_stats.total_subscriptions + excluded.total_subscriptions,
      total_follows = CASE WHEN excluded.total_follows > 0 THEN 1 ELSE user_stats.total_follows END,
      total_shares = user_stats.total_shares + excluded.total_shares,
      total_raids = user_stats.total_raids + excluded.total_raids,
      total_chats = user_stats.total_chats + excluded.total_chats,
      total_song_requests = user_stats.total_song_requests + excluded.total_song_requests,
      last_seen_at = excluded.last_seen_at
  `)

  // Pre-load gift catalog for diamond lookups
  const giftCatalog = new Map<string, number>()
  try {
    const rows = db.prepare('SELECT gift_id, diamond_count FROM tiktok_gifts').all() as any[]
    rows.forEach(r => giftCatalog.set(String(r.gift_id), r.diamond_count))
  } catch {}

  let processedCount = 0
  let skippedCount = 0
  let errorCount = 0

  const transaction = db.transaction(() => {
    for (const event of events) {
      try {
        const data = JSON.parse(event.data_json || '{}')
        const rawUsername = resolveHistoricalEventUsername(event.user_name, data)
        const username = rawUsername.toLowerCase().trim()
        
        if (!username || username === 'local alert test' || username === 'local_alert_test') {
          skippedCount++
          continue
        }

        const platform = event.platform
        const type = event.event_type
        const createdAt = event.created_at || new Date().toISOString()
        
        let increments = {
          likes: 0, gifts: 0, cents: 0, subs: 0, follows: 0, shares: 0, raids: 0, chats: 0, songs: 0, isFan: 0
        }

        const displayName = data.nickname || data.displayName || data.userName || data.uniqueId || data.user?.nickname || data.user?.uniqueId || rawUsername
        const pfp = data.profilePictureUrl || data.avatar_thumb?.url_list?.[0] || data.user?.profilePictureUrl || null
        const isFan = data.isFanClubMember === true || data.user?.isFanClubMember === true ? 1 : 0

        if (type === 'like') {
          increments.likes = Math.max(1, data.likeCount || 1)
        } else if (type === 'gift') {
          if (data.repeatEnd === false) continue
          const count = Math.max(1, data.giftCount || data.repeatCount || 1)
          let diamonds = data.diamondCount || 0
          if (diamonds === 0 && data.giftId) {
            diamonds = giftCatalog.get(String(data.giftId)) || 0
          }
          increments.gifts = count
          increments.cents = estimateTikTokCreatorGiftCents(diamonds, count)
        } else if (type === 'subscription') {
          increments.subs = 1
          increments.cents = data.monetaryValue || 499
        } else if (type === 'follow') {
          increments.follows = 1
        } else if (type === 'share') {
          increments.shares = 1
        } else if (type === 'raid') {
          increments.raids = 1
        } else if (type === 'chat') {
          increments.chats = 1
          
          // Detect song requests from chat messages to recover those stats too
          const message = (data.message || '').trim().toLowerCase()
          if (message.startsWith('!play ') || message.startsWith('.play ') || message.startsWith('/play ')) {
            increments.songs = 1
          }
        }

        insertUser.run(
          username, platform, displayName, pfp, isFan,
          increments.likes, increments.gifts, increments.cents, increments.subs,
          increments.follows, increments.shares, increments.raids, increments.chats, increments.songs,
          createdAt, createdAt
        )
        processedCount++
      } catch (err) {
        errorCount++
      }
    }
  })

  transaction()

  // 3. Rebuild global totals from the now-populated user_stats
  db.prepare(`
    UPDATE global_stats SET
      total_likes = (SELECT COALESCE(SUM(total_likes), 0) FROM user_stats),
      total_gifts = (SELECT COALESCE(SUM(total_gifts), 0) FROM user_stats),
      total_gift_value_cents = (SELECT COALESCE(SUM(total_gift_value_cents), 0) FROM user_stats),
      total_subscriptions = (SELECT COALESCE(SUM(total_subscriptions), 0) FROM user_stats),
      total_follows = (SELECT COUNT(*) FROM user_stats WHERE total_follows > 0),
      total_shares = (SELECT COALESCE(SUM(total_shares), 0) FROM user_stats),
      total_raids = (SELECT COALESCE(SUM(total_raids), 0) FROM user_stats),
      total_chats = (SELECT COALESCE(SUM(total_chats), 0) FROM user_stats),
      total_song_requests = (SELECT COALESCE(SUM(total_song_requests), 0) FROM user_stats)
  `).run()

  console.log(`[db] Stats rebuild complete. Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`)
}

function resolveHistoricalEventUsername(userName: string | null | undefined, data: any): string {
  const candidates = [userName, data?.username, data?.userName, data?.uniqueId, data?.user?.username, data?.user?.userName, data?.user?.uniqueId, data?.user?.nickname]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const normalized = candidate.trim()
    if (normalized) return normalized
  }
  return ''
}
