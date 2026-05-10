import BetterSqlite3 from 'better-sqlite3'

export function seedGlobalStats(db: BetterSqlite3.Database): void {
  const count = db.prepare('SELECT COUNT(*) as n FROM global_stats').get() as { n: number }
  if (count.n === 0) {
    db.prepare('INSERT INTO global_stats (total_likes) VALUES (0)').run()
  }
}

export function seedTikTokGifts(db: BetterSqlite3.Database): void {
  const gifts = [
    { id: '5655', name: 'Rose', diamonds: 1 },
    { id: '8913', name: 'Rosa', diamonds: 1 },
    { id: '7934', name: 'Heart Me', diamonds: 1 },
    { id: '13651', name: 'Popular Vote', diamonds: 1 },
    { id: '6013', name: 'Go Popular', diamonds: 1 }
  ]
  const stmt = db.prepare(`
    INSERT INTO tiktok_gifts (gift_id, name, diamond_count)
    VALUES (?, ?, ?)
    ON CONFLICT(gift_id) DO UPDATE SET name = excluded.name, diamond_count = excluded.diamond_count
  `)
  for (const gift of gifts) stmt.run(gift.id, gift.name, gift.diamonds)
}

export function seedActions(db: BetterSqlite3.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as n FROM deck_actions').get() as { n: number }
  if (existing.n > 0) return
  const defaults = [
    { id: 'KILL_TTS', name: 'Stop TTS', icon: '🔇', color: 'bg-red-500/20 text-red-400', type: 'DECK_ACTION' },
    { id: 'PHYSICS_DROP', name: 'Physics Drop', icon: '⚛️', color: 'bg-blue-500/20 text-blue-400', type: 'DECK_ACTION' },
    { id: 'SKIP_TRACK', name: 'Skip Song', icon: '⏭️', color: 'bg-green-500/20 text-green-400', type: 'DECK_ACTION' },
    { id: 'HUE_STRIKE', name: 'Hue Strobe', icon: '💡', color: 'bg-yellow-500/20 text-yellow-400', type: 'DECK_ACTION' },
    { id: 'HALVING', name: 'The Snap', icon: '🫰', color: 'bg-purple-500/20 text-purple-400', type: 'DECK_ACTION' },
    { id: 'POINTS_DROP', name: 'Points Drop', icon: '🪙', color: 'bg-amber-500/20 text-amber-400', type: 'DECK_ACTION' },
  ]
  const stmt = db.prepare('INSERT INTO deck_actions (id, name, icon, color, type, payload_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
  defaults.forEach((action, i) => stmt.run(action.id, action.name, action.icon, action.color ?? null, action.type, '{}', i))
}
