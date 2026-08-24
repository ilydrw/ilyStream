import type BetterSqlite3 from 'better-sqlite3'
import type { Database } from '../db/database'
import { isStreamPlatform, type Platform } from '../platforms/types'

export interface EconomyIdentity {
  username: string
  platform: Platform
  profileId: string | null
  ownerKey: string
  members: EconomyAccountKey[]
}

export interface EconomyIdentityHint {
  platformUserId?: string | null
  displayName?: string | null
}

export interface EconomyAccountKey {
  username: string
  platform: Platform
}

export interface EconomyMemberRow {
  username: string
  platform: Platform
  points: number
  xp: number
  updatedAt: string | null
}

export interface EconomyOwnerAggregate {
  ownerKey: string
  profileId: string | null
  username: string
  platform: Platform
  displayName: string
  points: number
  xp: number
  updatedAt: string | null
  members: EconomyMemberRow[]
}

interface EconomyOwnerQueryRow {
  username: string
  platform: Platform
  points: number
  xp: number
  updated_at: string | null
  resolved_profile_id: string | null
  profile_display_name: string | null
  primary_platform: string | null
  primary_username: string | null
  primary_is_member: number
}

/** Resolve an account to its persisted ilyStream Profile without changing its storage row. */
export function resolveEconomyIdentity(
  db: Pick<Database, 'getViewerProfileId' | 'getRawDb'> | object,
  username: string,
  platform: string,
  identity: EconomyIdentityHint = {},
  options: { loadProfileMembers?: boolean } = {}
): EconomyIdentity {
  const normalizedUsername = String(username || '').trim().replace(/^@+/, '').toLowerCase().slice(0, 120)
  const normalizedPlatform = String(platform || '').trim().toLowerCase().slice(0, 32)
  if (!normalizedUsername || !isStreamPlatform(normalizedPlatform)) {
    throw new Error('A supported economy platform and username are required.')
  }

  const resolver = (db as Partial<Pick<Database, 'getViewerProfileId'>>).getViewerProfileId
  const profileId = typeof resolver === 'function'
    ? resolver.call(db, normalizedPlatform, normalizedUsername, identity)
    : null
  const accountKey = `${normalizedPlatform}:${normalizeUsernameForMatch(normalizedUsername)}`
  const members = profileId && options.loadProfileMembers !== false
    ? loadProfileAccountKeys(db, profileId, { username: normalizedUsername, platform: normalizedPlatform })
    : [{ username: normalizedUsername, platform: normalizedPlatform }]

  return {
    username: normalizedUsername,
    platform: normalizedPlatform,
    profileId,
    ownerKey: profileId ? `profile:${profileId}` : `account:${accountKey}`,
    members
  }
}

/**
 * SQL predicate for every account currently connected to an economy owner.
 * Profile membership remains non-destructive: linking combines existing rows,
 * while unlinking naturally returns each account to its own stored balance.
 */
export function economyScopeWhere(identity: EconomyIdentity, tableAlias: string): { sql: string; params: unknown[] } {
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableAlias)) {
    throw new Error(`Invalid economy SQL alias: ${tableAlias}`)
  }

  const members = identity.members.length > 0
    ? identity.members
    : [{ username: identity.username, platform: identity.platform }]
  return {
    sql: `(${members.map(() => `(${tableAlias}.platform = ? AND ${tableAlias}.username COLLATE NOCASE = ?)`).join(' OR ')})`,
    params: members.flatMap((member) => [member.platform, member.username])
  }
}

export function sameEconomyOwner(first: EconomyIdentity, second: EconomyIdentity): boolean {
  return first.ownerKey === second.ownerKey
}

/** Load and combine all economy rows by their current ilyStream Profile membership. */
export function loadEconomyOwnerAggregates(raw: BetterSqlite3.Database): EconomyOwnerAggregate[] {
  const rows = raw.prepare(`
    SELECT
      economy_users.username,
      economy_users.platform,
      COALESCE(economy_users.points, 0) AS points,
      COALESCE(economy_users.xp, 0) AS xp,
      economy_users.updated_at,
      COALESCE(viewer_accounts.profile_id, user_stats.profile_id) AS resolved_profile_id,
      viewer_profiles.display_name AS profile_display_name,
      viewer_profiles.primary_platform,
      viewer_profiles.primary_username,
      CASE WHEN viewer_profiles.id IS NOT NULL AND (
        EXISTS (
          SELECT 1 FROM viewer_accounts AS primary_account
          WHERE primary_account.profile_id = viewer_profiles.id
            AND primary_account.platform = viewer_profiles.primary_platform
            AND primary_account.username = LOWER(viewer_profiles.primary_username)
        )
        OR EXISTS (
          SELECT 1 FROM user_stats AS primary_stat
          WHERE primary_stat.profile_id = viewer_profiles.id
            AND primary_stat.platform = viewer_profiles.primary_platform
            AND primary_stat.username = viewer_profiles.primary_username COLLATE NOCASE
        )
      ) THEN 1 ELSE 0 END AS primary_is_member
    FROM economy_users
    LEFT JOIN viewer_accounts
      ON viewer_accounts.platform = economy_users.platform
      AND viewer_accounts.username = LOWER(economy_users.username)
    LEFT JOIN user_stats
      ON user_stats.platform = economy_users.platform
      AND user_stats.username = LOWER(economy_users.username)
    LEFT JOIN viewer_profiles
      ON viewer_profiles.id = COALESCE(viewer_accounts.profile_id, user_stats.profile_id)
  `).all() as EconomyOwnerQueryRow[]

  const owners = new Map<string, EconomyOwnerAggregate>()
  for (const row of rows) {
    if (!isStreamPlatform(row.platform)) continue
    const profileId = row.resolved_profile_id || null
    const ownerKey = profileId
      ? `profile:${profileId}`
      : `account:${row.platform}:${normalizeUsernameForMatch(row.username)}`
    const preferredPlatform = row.primary_is_member && row.primary_platform && isStreamPlatform(row.primary_platform)
      ? row.primary_platform
      : row.platform
    const preferredUsername = profileId && row.primary_is_member && row.primary_username
      ? row.primary_username
      : row.username
    const member: EconomyMemberRow = {
      username: row.username,
      platform: row.platform,
      points: Math.max(0, toInteger(row.points)),
      xp: Math.max(0, toInteger(row.xp)),
      updatedAt: row.updated_at ? String(row.updated_at) : null
    }
    const existing = owners.get(ownerKey)

    if (!existing) {
      owners.set(ownerKey, {
        ownerKey,
        profileId,
        username: preferredUsername,
        platform: preferredPlatform,
        displayName: row.profile_display_name || preferredUsername,
        points: member.points,
        xp: member.xp,
        updatedAt: member.updatedAt,
        members: [member]
      })
      continue
    }

    existing.points += member.points
    existing.xp += member.xp
    existing.members.push(member)
    if (member.updatedAt && (!existing.updatedAt || member.updatedAt > existing.updatedAt)) {
      existing.updatedAt = member.updatedAt
    }
  }

  return Array.from(owners.values())
}

function normalizeUsernameForMatch(username: string): string {
  return String(username || '').trim().replace(/^@+/, '').toLowerCase()
}

function loadProfileAccountKeys(
  db: Pick<Database, 'getRawDb'> | object,
  profileId: string,
  actor: EconomyAccountKey
): EconomyAccountKey[] {
  const getRawDb = (db as Partial<Pick<Database, 'getRawDb'>>).getRawDb
  const rows = typeof getRawDb === 'function'
    ? getRawDb.call(db).prepare(`
        SELECT platform, username
        FROM viewer_accounts
        WHERE profile_id = ?
        UNION
        SELECT platform, LOWER(username) AS username
        FROM user_stats
        WHERE profile_id = ?
      `).all(profileId, profileId) as Array<{ platform: string; username: string }>
    : []

  const members = new Map<string, EconomyAccountKey>()
  for (const row of rows) {
    if (!isStreamPlatform(row.platform)) continue
    const username = normalizeUsernameForMatch(row.username)
    if (!username) continue
    members.set(`${row.platform}:${username}`, { platform: row.platform, username })
  }

  const actorUsername = normalizeUsernameForMatch(actor.username)
  members.set(`${actor.platform}:${actorUsername}`, { platform: actor.platform, username: actorUsername })
  return Array.from(members.values())
}

function toInteger(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0
}
