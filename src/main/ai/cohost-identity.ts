export function isCohostIdentity(user: any): boolean {
  if (!user || !user.username) return false
  const username = user.username.toLowerCase()
  return username === 'ilystream' || username === 'ily' || username === 'nightbot'
}
