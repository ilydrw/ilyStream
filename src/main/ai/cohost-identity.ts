import type { UserInfo } from '../platforms/types'

type CohostIdentityUser = Partial<Pick<UserInfo, 'id' | 'username' | 'displayName'>>

function normalizeIdentity(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/^@+/, '').replace(/[\s_-]+/g, '').toLowerCase()
    : ''
}

export function isCohostIdentity(user: CohostIdentityUser | null | undefined): boolean {
  if (!user) return false

  const values = [
    user.id,
    user.username,
    user.displayName
  ].map(normalizeIdentity)

  return values.some((value) => (
    value === 'aicohost' ||
    value === 'ilystreamai' ||
    value === 'ilystreambot' ||
    value === 'bot'
  ))
}
