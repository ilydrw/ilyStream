import type { UserIdentity } from '../../../shared/stats'

/** Borrow an account's avatar when the identity itself has none. */
export function fillMissingAvatar(identity: UserIdentity): void {
  if (identity.profilePictureUrl) return
  const accounts = identity.accounts || []
  const primaryAcc = accounts.find((account) => account.platform === identity.primaryPlatform && account.profilePictureUrl)
  const anyAcc = accounts.find((account) => account.profilePictureUrl)
  identity.profilePictureUrl = primaryAcc?.profilePictureUrl ?? anyAcc?.profilePictureUrl ?? identity.profilePictureUrl
}

/**
 * Assigns each identity an "overall" RANK (1 = best) by combining their
 * standing across every engagement/contribution category. For each category
 * we rank the audience (1 = top, ties share a position), sum each identity's
 * positions across all categories, then order by that sum.
 */
export function attachOverallRanks(identities: UserIdentity[]): void {
  const n = identities.length
  if (n === 0) return

  const categories: Array<keyof UserIdentity> = [
    'totalLikes',
    'totalGifts',
    'totalGiftValueCents',
    'totalShares',
    'totalRaids',
    'totalChats',
    'totalSongRequests'
  ]

  const rankSum = new Map<string, number>()
  for (const identity of identities) rankSum.set(identity.id, 0)

  for (const metric of categories) {
    const desc = [...identities].sort(
      (a, b) => Number((b as any)[metric] || 0) - Number((a as any)[metric] || 0)
    )
    let i = 0
    while (i < n) {
      const value = Number((desc[i] as any)[metric] || 0)
      let j = i
      while (j + 1 < n && Number((desc[j + 1] as any)[metric] || 0) === value) j++
      const position = i + 1
      for (let k = i; k <= j; k++) {
        rankSum.set(desc[k].id, (rankSum.get(desc[k].id) || 0) + position)
      }
      i = j + 1
    }
  }

  const ordered = [...identities].sort((a, b) => {
    const rankA = rankSum.get(a.id) || 0
    const rankB = rankSum.get(b.id) || 0
    if (rankA !== rankB) return rankA - rankB
    if ((b.totalGiftValueCents || 0) !== (a.totalGiftValueCents || 0)) {
      return (b.totalGiftValueCents || 0) - (a.totalGiftValueCents || 0)
    }
    return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '')
  })

  ordered.forEach((identity, index) => {
    identity.overallRank = index + 1
  })
}
