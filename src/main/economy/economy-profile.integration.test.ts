import { afterEach, describe, expect, it } from 'vitest'
import { StatsRepository } from '../db/repositories/StatsRepository'
import { SCHEMA_SQL } from '../db/schema'
import { LoyaltyService } from '../loyalty/loyalty-service'
import { EconomyService } from './economy-service'

const electronIt = process.versions.electron ? it : it.skip

interface Harness {
  raw: any
  db: any
  economy: EconomyService
  loyalty: LoyaltyService
  close: () => void
}

const openHarnesses: Harness[] = []

afterEach(() => {
  while (openHarnesses.length > 0) openHarnesses.pop()?.close()
})

async function makeHarness(): Promise<Harness> {
  const module = await import('better-sqlite3')
  const BetterSqlite3 = module.default
  const raw = new BetterSqlite3(':memory:')
  raw.exec(SCHEMA_SQL)

  const db = {
    getRawDb: () => raw,
    getViewerProfileId: (
      platform: string,
      username: string,
      identity: { platformUserId?: string | null } = {}
    ): string | null => {
      if (identity.platformUserId) {
        const byId = raw.prepare(`
          SELECT profile_id FROM viewer_accounts
          WHERE platform = ? AND platform_user_id = ?
          LIMIT 1
        `).get(platform, identity.platformUserId) as { profile_id: string } | undefined
        if (byId) return byId.profile_id
      }
      const byName = raw.prepare(`
        SELECT profile_id FROM viewer_accounts
        WHERE platform = ? AND username = LOWER(?)
        LIMIT 1
      `).get(platform, username) as { profile_id: string } | undefined
      return byName?.profile_id || null
    }
  }

  raw.prepare(`
    INSERT INTO viewer_profiles (id, display_name, primary_platform, primary_username)
    VALUES ('profile-queena', 'Queena Chaos', 'tiktok', 'queena.chaos')
  `).run()
  const addAccount = raw.prepare(`
    INSERT INTO viewer_accounts (profile_id, platform, username, platform_user_id, display_name)
    VALUES ('profile-queena', ?, LOWER(?), ?, ?)
  `)
  addAccount.run('tiktok', 'beautiful.monsta7', 'tt-korina', 'Korina Korina')
  addAccount.run('tiktok', 'queena.chaos', 'tt-queena', 'Queena.Chaos')
  addAccount.run('kick', 'queena_chaos', 'kick-queena', 'Queena Chaos')
  addAccount.run('twitch', 'queenachaos', 'tw-queena', 'Queena Chaos')
  addAccount.run('youtube', 'uca7zq', 'yt-queena', 'Queena Chaos')

  const addEconomy = raw.prepare(`
    INSERT INTO economy_users (username, platform, points, xp, level)
    VALUES (?, ?, ?, ?, ?)
  `)
  addEconomy.run('beautiful.monsta7', 'tiktok', 50_848, 489_167, 70)
  addEconomy.run('queena.chaos', 'tiktok', 56_086, 1_281_044, 114)
  addEconomy.run('Queena_Chaos', 'kick', 0, 87, 1)
  addEconomy.run('QueenaChaos', 'twitch', 0, 826, 3)
  addEconomy.run('UCA7ZQ', 'youtube', 0, 76, 1)

  const economy = new EconomyService(db as any)
  const loyalty = new LoyaltyService(db as any)
  const harness: Harness = {
    raw,
    db,
    economy,
    loyalty,
    close: () => {
      economy.dispose()
      raw.close()
    }
  }
  openHarnesses.push(harness)
  return harness
}

describe('connected-profile economy (Electron SQLite)', () => {
  electronIt('combines historical Sparks and XP for every linked alias', async () => {
    const { economy, loyalty } = await makeHarness()

    await expect(economy.getPoints('beautiful.monsta7', 'tiktok')).resolves.toBe(106_934)
    await expect(economy.getPoints('queena.chaos', 'tiktok')).resolves.toBe(106_934)
    expect(loyalty.getUserProgress('tiktok', 'beautiful.monsta7')).toMatchObject({
      xp: 1_771_200,
      level: 134
    })
    expect(loyalty.getUserProgress('kick', 'Queena_Chaos')).toMatchObject({
      xp: 1_771_200,
      level: 134
    })
    expect(loyalty.getTopUsers()).toEqual([
      expect.objectContaining({ username: 'queena.chaos', xp: 1_771_200, level: 134 })
    ])
    expect(loyalty.getUserRank('tiktok', 'beautiful.monsta7')).toBe(1)
    expect(loyalty.getUserRank('tiktok', 'queena.chaos')).toBe(1)
    expect(economy.getTopAccounts().filter((entry) => entry.username === 'queena.chaos')).toEqual([
      expect.objectContaining({ points: 106_934, xp: 1_771_200, level: 134 })
    ])
    expect(economy.getDashboard().totals).toMatchObject({
      accounts: 1,
      pointsInCirculation: 106_934
    })
  })

  electronIt('adds only the XP delta and emits one shared-profile level transition', async () => {
    const { raw, loyalty } = await makeHarness()
    const levelUps: unknown[] = []
    loyalty.on('level-up', (event) => levelUps.push(event))

    loyalty.addXp({
      username: 'beautiful.monsta7',
      platform: 'tiktok',
      platformUserId: 'tt-korina',
      displayName: 'Korina Korina',
      amount: 24_400,
      reason: 'test-threshold'
    })

    expect(loyalty.getUserProgress('tiktok', 'queena.chaos')).toMatchObject({
      xp: 1_795_600,
      level: 135
    })
    expect(raw.prepare(`
      SELECT xp FROM economy_users WHERE platform = 'tiktok' AND username = 'beautiful.monsta7'
    `).get()).toEqual({ xp: 513_567 })
    expect(levelUps).toHaveLength(1)
    expect(levelUps[0]).toMatchObject({
      previousLevel: 134,
      level: 135,
      username: 'beautiful.monsta7',
      platformUserId: 'tt-korina'
    })
  })

  electronIt('canonicalizes connector casing and leading @ before writing shared Sparks or XP', async () => {
    const { raw, economy, loyalty } = await makeHarness()
    const identity = { platformUserId: 'tt-korina', displayName: 'Korina Korina' }

    await expect(economy.addPoints('@BEAUTIFUL.MONSTA7', 'tiktok', 66, identity)).resolves.toBe(107_000)
    loyalty.addXp({
      username: '@BEAUTIFUL.MONSTA7',
      platform: 'tiktok',
      platformUserId: 'tt-korina',
      displayName: 'Korina Korina',
      amount: 100,
      reason: 'normalization-test'
    })

    expect(loyalty.getUserProgress('tiktok', 'queena.chaos')).toMatchObject({ xp: 1_771_300, level: 134 })
    expect(raw.prepare(`
      SELECT COUNT(*) AS count FROM economy_users WHERE username LIKE '@%'
    `).get()).toEqual({ count: 0 })
    expect(raw.prepare(`
      SELECT points, xp FROM economy_users
      WHERE username = 'beautiful.monsta7' AND platform = 'tiktok'
    `).get()).toEqual({ points: 50_914, xp: 489_267 })
  })

  electronIt('spends atomically across member rows and blocks alias self-transfers and double dailies', async () => {
    const { raw, economy } = await makeHarness()

    await expect(economy.spendPoints('beautiful.monsta7', 'tiktok', 200_000)).resolves.toBe(false)
    await expect(economy.getPoints('beautiful.monsta7', 'tiktok')).resolves.toBe(106_934)
    await expect(economy.spendPoints('beautiful.monsta7', 'tiktok', 60_000)).resolves.toBe(true)
    await expect(economy.getPoints('queena.chaos', 'tiktok')).resolves.toBe(46_934)
    const balances = raw.prepare(`
      SELECT username, points FROM economy_users
      WHERE platform = 'tiktok' ORDER BY username
    `).all() as Array<{ username: string; points: number }>
    expect(balances).toEqual([
      { username: 'beautiful.monsta7', points: 0 },
      { username: 'queena.chaos', points: 46_934 }
    ])
    expect(economy.transferPoints('beautiful.monsta7', 'tiktok', 'queena.chaos', 10)).toMatchObject({
      ok: false,
      error: 'same-user',
      balance: 46_934
    })

    const now = new Date('2026-08-14T12:00:00.000Z')
    expect(economy.claimDaily('beautiful.monsta7', 'tiktok', 134, now).ok).toBe(true)
    expect(economy.claimDaily('queena.chaos', 'tiktok', 134, now)).toMatchObject({
      ok: false,
      alreadyClaimed: true
    })
  })

  electronIt('shares redemption cooldowns and refunds across aliases', async () => {
    const { economy } = await makeHarness()
    const now = new Date('2026-08-14T12:00:00.000Z')

    const purchase = economy.purchaseRedemption('beautiful.monsta7', 'tiktok', 'flash', 134, now)
    expect(purchase).toMatchObject({ ok: true, balance: 106_684 })
    expect(economy.purchaseRedemption(
      'queena.chaos',
      'tiktok',
      'flash',
      134,
      new Date(now.getTime() + 1000)
    )).toMatchObject({
      ok: false,
      error: 'cooldown',
      balance: 106_684
    })

    expect(economy.refundRedemption(purchase.purchaseId!)).toBe(106_934)
    await expect(economy.getPoints('queena.chaos', 'tiktok')).resolves.toBe(106_934)
  })

  electronIt('refunds the exact member rows across a rename and unlink during a redemption effect', async () => {
    const { raw, economy } = await makeHarness()
    raw.prepare(`
      INSERT INTO user_stats (
        username, platform, platform_user_id, display_name, profile_id
      ) VALUES ('beautiful.monsta7', 'tiktok', 'tt-korina', 'Korina Korina', 'profile-queena')
    `).run()
    raw.prepare(`
      UPDATE economy_users SET points = 100
      WHERE platform = 'tiktok' AND username = 'beautiful.monsta7'
    `).run()

    const purchase = economy.purchaseRedemption(
      'beautiful.monsta7',
      'tiktok',
      'flash',
      134,
      new Date('2026-08-14T12:00:00.000Z')
    )
    expect(purchase).toMatchObject({ ok: true, balance: 55_936 })
    const purchaseLedger = raw.prepare(`
      SELECT metadata_json FROM economy_transactions
      WHERE reference_id = ? AND kind = 'spend'
    `).get(`redemption:${purchase.purchaseId}`) as { metadata_json: string }
    expect(JSON.parse(purchaseLedger.metadata_json).debitAllocations).toEqual([
      {
        username: 'beautiful.monsta7',
        platform: 'tiktok',
        amount: 100,
        platformUserId: 'tt-korina'
      },
      {
        username: 'queena.chaos',
        platform: 'tiktok',
        amount: 150,
        platformUserId: 'tt-queena'
      }
    ])
    expect(raw.prepare(`
      SELECT username, points FROM economy_users
      WHERE platform = 'tiktok' ORDER BY username
    `).all()).toEqual([
      { username: 'beautiful.monsta7', points: 0 },
      { username: 'queena.chaos', points: 55_936 }
    ])

    const stats = new StatsRepository(raw)
    expect(stats.mergeRenamedAccount('tiktok', 'beautiful.monsta7', 'korina.renamed', {
      platformUserId: 'tt-korina',
      displayName: 'Korina Renamed'
    })).toMatchObject({ username: 'korina.renamed' })
    stats.unlinkAccount('tiktok', 'korina.renamed')
    expect(raw.prepare(`
      SELECT username, platform_user_id FROM user_stats
      WHERE platform = 'tiktok' ORDER BY username
    `).all()).toEqual([
      { username: 'korina.renamed', platform_user_id: 'tt-korina' }
    ])
    expect(raw.prepare(`
      SELECT username, points FROM economy_users
      WHERE platform = 'tiktok' ORDER BY username
    `).all()).toEqual([
      { username: 'korina.renamed', points: 0 },
      { username: 'queena.chaos', points: 55_936 }
    ])

    expect(economy.refundRedemption(purchase.purchaseId!)).toBe(100)
    await expect(economy.getPoints('korina.renamed', 'tiktok')).resolves.toBe(100)
    await expect(economy.getPoints('queena.chaos', 'tiktok')).resolves.toBe(56_086)
  })

  electronIt('reveals each original account balance again when an account is unlinked', async () => {
    const { raw, economy } = await makeHarness()

    raw.prepare(`
      DELETE FROM viewer_accounts WHERE platform = 'tiktok' AND username = 'beautiful.monsta7'
    `).run()

    await expect(economy.getPoints('beautiful.monsta7', 'tiktok')).resolves.toBe(50_848)
    await expect(economy.getPoints('queena.chaos', 'tiktok')).resolves.toBe(56_086)
  })

  electronIt('keeps shared ownership, claims, cooldowns, and refunds through a stable-ID rename', async () => {
    const { raw, economy, loyalty } = await makeHarness()
    raw.prepare(`
      INSERT INTO user_stats (
        username, platform, platform_user_id, display_name, profile_id
      ) VALUES ('beautiful.monsta7', 'tiktok', 'tt-korina', 'Korina Korina', 'profile-queena')
    `).run()
    raw.prepare(`
      INSERT INTO economy_users (username, platform, points, xp, level)
      VALUES ('Beautiful.Monsta7', 'tiktok', 100, 200, 1),
             ('Korina.Renamed', 'tiktok', 300, 400, 1)
    `).run()
    raw.prepare(`
      INSERT INTO economy_daily_claims (username, platform, claim_date, streak, reward, created_at)
      VALUES ('Beautiful.Monsta7', 'tiktok', '2026-08-14', 3, 80, '2026-08-14 11:00:00'),
             ('Korina.Renamed', 'tiktok', '2026-08-14', 5, 100, '2026-08-14 10:00:00')
    `).run()
    raw.prepare(`
      INSERT INTO economy_redemption_uses (
        id, redemption_id, username, platform, cost, status, created_at
      ) VALUES (
        'rename-purchase', 'neon-flash', 'Beautiful.Monsta7', 'tiktok', 250, 'completed', '2026-08-14 12:00:00'
      )
    `).run()

    const renamedIdentity = { platformUserId: 'tt-korina', displayName: 'Korina Renamed' }
    await expect(economy.getPoints('korina.renamed', 'tiktok', renamedIdentity)).resolves.toBe(107_334)
    expect(loyalty.getUserProgress('tiktok', 'korina.renamed', renamedIdentity)).toMatchObject({
      xp: 1_771_800,
      level: 134
    })

    const stats = new StatsRepository(raw)
    expect(stats.mergeRenamedAccount('tiktok', 'beautiful.monsta7', 'korina.renamed', renamedIdentity))
      .toMatchObject({ username: 'korina.renamed', platform_user_id: 'tt-korina' })

    expect(raw.prepare(`
      SELECT username, points, xp, level
      FROM economy_users
      WHERE platform = 'tiktok' AND username = 'korina.renamed'
    `).get()).toEqual({ username: 'korina.renamed', points: 51_248, xp: 489_767, level: 70 })
    expect(raw.prepare(`
      SELECT COUNT(*) AS count
      FROM economy_users
      WHERE platform = 'tiktok'
        AND (username = 'beautiful.monsta7' COLLATE NOCASE OR username = 'korina.renamed' COLLATE NOCASE)
    `).get()).toEqual({ count: 1 })
    expect(raw.prepare(`
      SELECT username, streak, reward, created_at
      FROM economy_daily_claims
      WHERE platform = 'tiktok' AND claim_date = '2026-08-14'
    `).all()).toEqual([
      { username: 'korina.renamed', streak: 5, reward: 100, created_at: '2026-08-14 10:00:00' }
    ])
    expect(economy.claimDaily(
      'korina.renamed',
      'tiktok',
      134,
      new Date('2026-08-14T12:00:01.000Z'),
      renamedIdentity
    )).toMatchObject({ ok: false, alreadyClaimed: true })
    expect(economy.purchaseRedemption(
      'korina.renamed',
      'tiktok',
      'flash',
      134,
      new Date('2026-08-14T12:00:01.000Z'),
      renamedIdentity
    )).toMatchObject({ ok: false, error: 'cooldown', balance: 107_334 })

    expect(economy.refundRedemption('rename-purchase')).toBe(107_584)
    await expect(economy.getPoints('queena.chaos', 'tiktok')).resolves.toBe(107_584)
    expect(raw.prepare(`
      SELECT username, status FROM economy_redemption_uses WHERE id = 'rename-purchase'
    `).get()).toEqual({ username: 'korina.renamed', status: 'refunded' })
  })
})
