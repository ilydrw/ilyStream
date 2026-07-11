import BetterSqlite3 from 'better-sqlite3'
import crypto from 'crypto'
import { BaseRepository } from './BaseRepository'
import type {
  ViewerAccount,
  ViewerAccountInput,
  ViewerProfile,
  ViewerProfileInput
} from '../../../shared/stats'
import type { UserStatRow } from '../database'
import type { Platform } from '../../platforms/types'
import {
  calculateSimilarity,
  normalizeOptionalText,
  normalizeUsername,
  safeDisplayName,
  uniqueNonEmpty,
  type ViewerAccountRow,
  type ViewerProfileRow
} from './StatsRepository.helpers'

export class ViewerProfileRepository extends BaseRepository {
  constructor(
    db: BetterSqlite3.Database,
    private readonly getUserStat: (platform: string, username: string) => UserStatRow | null
  ) {
    super(db)
  }

  getLinkSuggestions(profileId: string): Array<{ platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }> {
    const profile = this.getViewerProfile(profileId)
    if (!profile) return []

    const sourceNames = profile.accounts.map((account) => account.username)
    if (profile.displayName) sourceNames.push(profile.displayName)

    const allOtherAccounts = this.db.prepare(`
      SELECT platform, username, display_name, profile_picture_url, profile_id
      FROM user_stats
      WHERE profile_id IS NULL OR profile_id != ?
    `).all(profileId) as Array<{ platform: string; username: string; display_name: string; profile_picture_url: string | null; profile_id: string | null }>

    const suggestions: Array<{ platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }> = []

    for (const account of allOtherAccounts) {
      let maxSimilarity = 0
      for (const sourceName of sourceNames) {
        maxSimilarity = Math.max(
          maxSimilarity,
          calculateSimilarity(sourceName, account.username),
          calculateSimilarity(sourceName, account.display_name)
        )
      }

      if (maxSimilarity >= 0.75) {
        suggestions.push({
          platform: account.platform as Platform,
          username: account.username,
          displayName: account.display_name,
          profilePictureUrl: account.profile_picture_url,
          similarity: maxSimilarity,
          profileId: account.profile_id
        })
      }
    }

    return suggestions.sort((a, b) => b.similarity - a.similarity).slice(0, 5)
  }

  linkAccounts(p1: string, u1: string, p2: string, u2: string): ViewerProfile | null {
    const account1 = this.normalizeAccountInput({ platform: p1 as Platform, username: u1 })
    const account2 = this.normalizeAccountInput({ platform: p2 as Platform, username: u2 })
    if (!account1 || !account2) return null
    if (account1.platform === account2.platform && account1.username === account2.username) {
      return this.getViewerProfileByAccount(account1.platform, account1.username)
    }

    const profileId = this.getOrCreateProfileForAccount(account1)
    const secondProfileId = this.getViewerProfileId(account2.platform, account2.username)
    if (secondProfileId && secondProfileId !== profileId) {
      this.mergeViewerProfiles(profileId, secondProfileId)
    }
    this.addAccountToProfile(profileId, account1)
    this.addAccountToProfile(profileId, account2)
    this.syncStatsProfileIdForProfile(profileId)
    return this.getViewerProfile(profileId)
  }

  unlinkAccount(platform: string, username: string): void {
    const normalizedUsername = normalizeUsername(username)
    if (!platform || !normalizedUsername) return

    const account = this.db.prepare(
      'SELECT profile_id FROM viewer_accounts WHERE platform = ? AND username = ?'
    ).get(platform, normalizedUsername) as { profile_id: string } | undefined

    this.db.prepare('DELETE FROM viewer_accounts WHERE platform = ? AND username = ?').run(platform, normalizedUsername)
    this.db.prepare('UPDATE user_stats SET profile_id = NULL WHERE platform = ? AND LOWER(username) = ?')
      .run(platform, normalizedUsername)

    if (account?.profile_id) {
      this.refreshViewerProfile(account.profile_id)
    }
  }

  getViewerProfileId(
    platform: string,
    username: string,
    identity: { platformUserId?: string | null; displayName?: string | null } = {}
  ): string | null {
    const normalizedUsername = normalizeUsername(username)
    const normalizedDisplayName = normalizeUsername(identity.displayName || undefined)
    const normalizedPlatformUserId = normalizeOptionalText(identity.platformUserId)
    if (!normalizedUsername && !normalizedDisplayName && !normalizedPlatformUserId) return null

    if (platform && platform !== 'all') {
      if (normalizedPlatformUserId) {
        const accountById = this.db.prepare(
          'SELECT profile_id FROM viewer_accounts WHERE platform = ? AND platform_user_id = ? ORDER BY last_seen_at DESC LIMIT 1'
        ).get(platform, normalizedPlatformUserId) as { profile_id: string } | undefined
        if (accountById?.profile_id) return accountById.profile_id

        const statById = this.db.prepare(
          'SELECT profile_id FROM user_stats WHERE platform = ? AND platform_user_id = ? AND profile_id IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1'
        ).get(platform, normalizedPlatformUserId) as { profile_id: string | null } | undefined
        if (statById?.profile_id) return statById.profile_id
      }

      for (const candidate of uniqueNonEmpty([normalizedUsername, normalizedDisplayName])) {
        const account = this.db.prepare(
          'SELECT profile_id FROM viewer_accounts WHERE platform = ? AND (username = ? OR LOWER(display_name) = ?) ORDER BY last_seen_at DESC LIMIT 1'
        ).get(platform, candidate, candidate) as { profile_id: string } | undefined
        if (account?.profile_id) return account.profile_id

        const stat = this.db.prepare(
          'SELECT profile_id FROM user_stats WHERE platform = ? AND (LOWER(username) = ? OR LOWER(display_name) = ?) AND profile_id IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1'
        ).get(platform, candidate, candidate) as { profile_id: string | null } | undefined
        if (stat?.profile_id) return stat.profile_id
      }

      return null
    }

    if (normalizedPlatformUserId) {
      const accountById = this.db.prepare(
        'SELECT profile_id FROM viewer_accounts WHERE platform_user_id = ? ORDER BY last_seen_at DESC LIMIT 1'
      ).get(normalizedPlatformUserId) as { profile_id: string } | undefined
      if (accountById?.profile_id) return accountById.profile_id

      const statById = this.db.prepare(
        'SELECT profile_id FROM user_stats WHERE platform_user_id = ? AND profile_id IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1'
      ).get(normalizedPlatformUserId) as { profile_id: string | null } | undefined
      if (statById?.profile_id) return statById.profile_id
    }

    for (const candidate of uniqueNonEmpty([normalizedUsername, normalizedDisplayName])) {
      const account = this.db.prepare(
        'SELECT profile_id FROM viewer_accounts WHERE username = ? OR LOWER(display_name) = ? ORDER BY last_seen_at DESC LIMIT 1'
      ).get(candidate, candidate) as { profile_id: string } | undefined
      if (account?.profile_id) return account.profile_id

      const stat = this.db.prepare(
        'SELECT profile_id FROM user_stats WHERE (LOWER(username) = ? OR LOWER(display_name) = ?) AND profile_id IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1'
      ).get(candidate, candidate) as { profile_id: string | null } | undefined
      if (stat?.profile_id) return stat.profile_id
    }

    return null
  }

  getViewerProfiles(opts: { query?: string; limit?: number } = {}): ViewerProfile[] {
    const params: unknown[] = []
    const where: string[] = []
    if (opts.query?.trim()) {
      const like = `%${opts.query.trim().toLowerCase()}%`
      where.push(`(
        LOWER(viewer_profiles.display_name) LIKE ?
        OR EXISTS (
          SELECT 1 FROM viewer_accounts
          WHERE viewer_accounts.profile_id = viewer_profiles.id
            AND (viewer_accounts.username LIKE ? OR LOWER(viewer_accounts.display_name) LIKE ?)
        )
      )`)
      params.push(like, like, like)
    }
    const limit = Math.max(1, Math.min(1000, Math.floor(opts.limit ?? 500)))
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = this.db.prepare(`
      SELECT id FROM viewer_profiles
      ${whereSql}
      ORDER BY updated_at DESC, display_name ASC
      LIMIT ?
    `).all(...params, limit) as Array<{ id: string }>

    return rows
      .map((row) => this.getViewerProfile(row.id))
      .filter((profile): profile is ViewerProfile => Boolean(profile))
  }

  getViewerProfile(profileId: string): ViewerProfile | null {
    const row = this.db.prepare('SELECT * FROM viewer_profiles WHERE id = ?').get(profileId) as ViewerProfileRow | undefined
    if (!row) return null
    return {
      id: row.id,
      displayName: row.display_name,
      profilePictureUrl: row.profile_picture_url,
      notes: row.notes || '',
      primaryPlatform: row.primary_platform as Platform | null,
      primaryUsername: row.primary_username ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accounts: this.getViewerAccounts(row.id)
    }
  }

  getViewerProfileByAccount(platform: string, username: string): ViewerProfile | null {
    const profileId = this.getViewerProfileId(platform, username)
    return profileId ? this.getViewerProfile(profileId) : null
  }

  createViewerProfile(input: ViewerProfileInput): ViewerProfile {
    const firstAccount = input.accounts?.map((account) => this.normalizeAccountInput(account)).find(Boolean) || null
    const id = crypto.randomUUID()
    const displayName = safeDisplayName(input.displayName || firstAccount?.displayName || firstAccount?.username || 'Viewer')
    const primaryPlatform = input.primaryPlatform || firstAccount?.platform || null
    const profilePictureUrl = input.profilePictureUrl || firstAccount?.profilePictureUrl || null

    this.db.prepare(`
      INSERT INTO viewer_profiles (id, display_name, profile_picture_url, notes, primary_platform, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(id, displayName, profilePictureUrl, input.notes || '', primaryPlatform)

    for (const account of input.accounts || []) {
      this.addAccountToProfile(id, account)
    }
    this.refreshViewerProfile(id)
    return this.getViewerProfile(id)!
  }

  updateViewerProfile(profileId: string, patch: Partial<ViewerProfileInput>): ViewerProfile | null {
    const existing = this.getViewerProfile(profileId)
    if (!existing) return null

    this.db.prepare(`
      UPDATE viewer_profiles
      SET display_name = ?, profile_picture_url = ?, notes = ?, primary_platform = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      safeDisplayName(patch.displayName ?? existing.displayName),
      patch.profilePictureUrl !== undefined ? patch.profilePictureUrl : existing.profilePictureUrl,
      patch.notes ?? existing.notes,
      patch.primaryPlatform === undefined ? existing.primaryPlatform : patch.primaryPlatform,
      profileId
    )

    return this.getViewerProfile(profileId)
  }

  addAccountToProfile(profileId: string, accountInput: ViewerAccountInput): ViewerProfile | null {
    const account = this.normalizeAccountInput(accountInput)
    if (!account || !this.getViewerProfile(profileId)) return null

    const existingProfileId = this.getViewerProfileId(account.platform, account.username)
    if (existingProfileId && existingProfileId !== profileId) {
      this.mergeViewerProfiles(profileId, existingProfileId)
    }

    const stat = this.getUserStat(account.platform, account.username)
    this.upsertViewerAccount(profileId, {
      ...account,
      platformUserId: account.platformUserId ?? stat?.platform_user_id ?? null,
      displayName: account.displayName || stat?.display_name || account.username,
      profilePictureUrl: account.profilePictureUrl ?? stat?.profile_picture_url ?? null
    })
    this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE platform = ? AND LOWER(username) = ?')
      .run(profileId, account.platform, account.username)
    this.refreshViewerProfile(profileId)
    return this.getViewerProfile(profileId)
  }

  upsertViewerAccount(profileId: string, accountInput: ViewerAccountInput): void {
    const account = this.normalizeAccountInput(accountInput)
    if (!account) return

    this.ensureViewerProfile(profileId, account.displayName || account.username, account.platform)
    this.db.prepare(`
      INSERT INTO viewer_accounts (
        profile_id, platform, username, platform_user_id, display_name, profile_picture_url, first_seen_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(platform, username) DO UPDATE SET
        profile_id = excluded.profile_id,
        platform_user_id = COALESCE(excluded.platform_user_id, viewer_accounts.platform_user_id),
        display_name = COALESCE(NULLIF(excluded.display_name, ''), viewer_accounts.display_name),
        profile_picture_url = COALESCE(excluded.profile_picture_url, viewer_accounts.profile_picture_url),
        last_seen_at = CURRENT_TIMESTAMP
    `).run(
      profileId,
      account.platform,
      account.username,
      account.platformUserId ?? null,
      account.displayName || account.username,
      account.profilePictureUrl ?? null
    )
  }

  mergeViewerProfiles(targetProfileId: string, sourceProfileId: string): void {
    if (targetProfileId === sourceProfileId) return

    const sourceAccounts = this.getViewerAccounts(sourceProfileId)
    const transaction = this.db.transaction(() => {
      for (const account of sourceAccounts) {
        this.upsertViewerAccount(targetProfileId, account)
      }
      this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE profile_id = ?')
        .run(targetProfileId, sourceProfileId)
      this.db.prepare('DELETE FROM viewer_accounts WHERE profile_id = ?').run(sourceProfileId)
      this.db.prepare('DELETE FROM viewer_profiles WHERE id = ?').run(sourceProfileId)
    })
    transaction()
    this.refreshViewerProfile(targetProfileId)
  }

  mergeViewerAccountRows(
    platform: string,
    sourceUsername: string,
    targetUsername: string,
    metadata: {
      platformUserId?: string | null
      displayName?: string
      profilePictureUrl?: string | null
    }
  ): void {
    const source = this.db.prepare(
      'SELECT * FROM viewer_accounts WHERE platform = ? AND username = ?'
    ).get(platform, sourceUsername) as ViewerAccountRow | undefined
    const target = this.db.prepare(
      'SELECT * FROM viewer_accounts WHERE platform = ? AND username = ?'
    ).get(platform, targetUsername) as ViewerAccountRow | undefined

    const platformUserId = normalizeOptionalText(metadata.platformUserId) || source?.platform_user_id || target?.platform_user_id || null
    const displayName = safeDisplayName(metadata.displayName || target?.display_name || source?.display_name || targetUsername)
    const profilePictureUrl = metadata.profilePictureUrl ?? target?.profile_picture_url ?? source?.profile_picture_url ?? null

    if (source && target) {
      this.db.prepare(`
        UPDATE viewer_accounts
        SET profile_id = COALESCE(viewer_accounts.profile_id, ?),
            platform_user_id = COALESCE(?, viewer_accounts.platform_user_id, ?),
            display_name = ?,
            profile_picture_url = COALESCE(?, viewer_accounts.profile_picture_url, ?),
            first_seen_at = CASE
              WHEN viewer_accounts.first_seen_at IS NULL OR ? < viewer_accounts.first_seen_at THEN ?
              ELSE viewer_accounts.first_seen_at
            END,
            last_seen_at = CASE
              WHEN viewer_accounts.last_seen_at IS NULL OR ? > viewer_accounts.last_seen_at THEN ?
              ELSE viewer_accounts.last_seen_at
            END
        WHERE platform = ? AND username = ?
      `).run(
        source.profile_id,
        platformUserId,
        source.platform_user_id,
        displayName,
        profilePictureUrl,
        source.profile_picture_url,
        source.first_seen_at,
        source.first_seen_at,
        source.last_seen_at,
        source.last_seen_at,
        platform,
        targetUsername
      )
      this.db.prepare('DELETE FROM viewer_accounts WHERE platform = ? AND username = ?').run(platform, sourceUsername)
      this.refreshViewerProfile(target.profile_id)
      return
    }

    if (source && !target) {
      this.db.prepare(`
        UPDATE viewer_accounts
        SET username = ?,
            platform_user_id = COALESCE(?, platform_user_id),
            display_name = ?,
            profile_picture_url = COALESCE(?, profile_picture_url),
            last_seen_at = CURRENT_TIMESTAMP
        WHERE platform = ? AND username = ?
      `).run(
        targetUsername,
        platformUserId,
        displayName,
        profilePictureUrl,
        platform,
        sourceUsername
      )
      this.refreshViewerProfile(source.profile_id)
      return
    }

    if (target) {
      this.db.prepare(`
        UPDATE viewer_accounts
        SET platform_user_id = COALESCE(?, platform_user_id),
            display_name = ?,
            profile_picture_url = COALESCE(?, profile_picture_url),
            last_seen_at = CURRENT_TIMESTAMP
        WHERE platform = ? AND username = ?
      `).run(platformUserId, displayName, profilePictureUrl, platform, targetUsername)
      this.refreshViewerProfile(target.profile_id)
    }
  }

  private getViewerAccounts(profileId: string): ViewerAccount[] {
    const rows = this.db.prepare(`
      SELECT * FROM viewer_accounts
      WHERE profile_id = ?
      ORDER BY last_seen_at DESC, platform ASC, username ASC
    `).all(profileId) as ViewerAccountRow[]

    return rows.map((row) => ({
      profileId: row.profile_id,
      platform: row.platform as Platform,
      username: row.username,
      platformUserId: row.platform_user_id,
      displayName: row.display_name,
      profilePictureUrl: row.profile_picture_url,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at
    }))
  }

  private getOrCreateProfileForAccount(account: ViewerAccountInput): string {
    const normalized = this.normalizeAccountInput(account)
    if (!normalized) throw new Error('Cannot create a viewer profile without a platform and username.')

    const existingProfileId = this.getViewerProfileId(normalized.platform, normalized.username)
    if (existingProfileId) {
      this.addAccountToProfile(existingProfileId, normalized)
      return existingProfileId
    }

    const stat = this.getUserStat(normalized.platform, normalized.username)
    const profileId = stat?.profile_id || crypto.randomUUID()
    this.ensureViewerProfile(
      profileId,
      safeDisplayName(normalized.displayName || stat?.display_name || normalized.username),
      normalized.platform
    )
    this.upsertViewerAccount(profileId, {
      ...normalized,
      platformUserId: normalized.platformUserId ?? stat?.platform_user_id ?? null,
      displayName: normalized.displayName || stat?.display_name || normalized.username,
      profilePictureUrl: normalized.profilePictureUrl ?? stat?.profile_picture_url ?? null
    })
    this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE platform = ? AND LOWER(username) = ?')
      .run(profileId, normalized.platform, normalized.username)
    return profileId
  }

  private normalizeAccountInput(account: ViewerAccountInput): ViewerAccountInput | null {
    const username = normalizeUsername(account.username)
    const platform = String(account.platform || '').trim() as Platform
    if (!username || !platform || platform === ('all' as Platform)) return null
    return {
      platform,
      username,
      platformUserId: normalizeOptionalText(account.platformUserId),
      displayName: safeDisplayName(account.displayName || username),
      profilePictureUrl: account.profilePictureUrl ?? null
    }
  }

  private ensureViewerProfile(profileId: string, displayName: string, primaryPlatform: string | null): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO viewer_profiles (id, display_name, primary_platform, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(profileId, safeDisplayName(displayName), primaryPlatform)
  }

  private syncStatsProfileIdForProfile(profileId: string): void {
    const accounts = this.getViewerAccounts(profileId)
    const update = this.db.prepare('UPDATE user_stats SET profile_id = ? WHERE platform = ? AND LOWER(username) = ?')
    const transaction = this.db.transaction(() => {
      for (const account of accounts) {
        update.run(profileId, account.platform, account.username)
      }
    })
    transaction()
  }

  private refreshViewerProfile(profileId: string): void {
    const accounts = this.getViewerAccounts(profileId)
    const latest = accounts[0]
    if (!latest) {
      this.db.prepare('UPDATE viewer_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(profileId)
      return
    }

    this.db.prepare(`
      UPDATE viewer_profiles
      SET primary_platform = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(latest.platform, profileId)
    this.syncStatsProfileIdForProfile(profileId)
  }
}
