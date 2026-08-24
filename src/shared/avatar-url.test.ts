import { describe, expect, it } from 'vitest'
import { avatarImageKey, isSameAvatarImage, AvatarUrlStabilizer } from './avatar-url'

// Two real-shaped TikTok URLs for the SAME image: different shard host (p16/p19)
// and different signature query — the exact churn seen in production.
const TT_P16 =
  'https://p16-common-sign.tiktokcdn-us.com/tos-useast8-avt-0068-tx2/fa1840cf~tplv-tiktokx-cropcenter:100:100.webp?refresh_token=aaa&x-signature=one&x-expires=1'
const TT_P19 =
  'https://p19-common-sign.tiktokcdn-us.com/tos-useast8-avt-0068-tx2/fa1840cf~tplv-tiktokx-cropcenter:100:100.webp?refresh_token=bbb&x-signature=two&x-expires=2'
const TT_OTHER =
  'https://p16-common-sign.tiktokcdn-us.com/tos-useast8-avt-0068-tx2/DIFFERENT~tplv-tiktokx-cropcenter:100:100.webp?refresh_token=ccc&x-signature=three'

describe('avatarImageKey', () => {
  it('collapses TikTok shard host + signature to a stable identity', () => {
    expect(avatarImageKey(TT_P16)).toBe(avatarImageKey(TT_P19))
  })

  it('keeps distinct images distinct', () => {
    expect(avatarImageKey(TT_P16)).not.toBe(avatarImageKey(TT_OTHER))
  })

  it('does not strip the query for non-TikTok hosts (query can be meaningful)', () => {
    const alice = 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice'
    const bob = 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob'
    expect(avatarImageKey(alice)).not.toBe(avatarImageKey(bob))
  })

  it('returns empty for blank/invalid input', () => {
    expect(avatarImageKey('')).toBe('')
    expect(avatarImageKey(undefined)).toBe('')
    expect(avatarImageKey('not a url')).toBe('not a url')
  })
})

describe('isSameAvatarImage', () => {
  it('treats re-signed / host-rotated TikTok URLs as the same image', () => {
    expect(isSameAvatarImage(TT_P16, TT_P19)).toBe(true)
  })
  it('is false for different images and for empties', () => {
    expect(isSameAvatarImage(TT_P16, TT_OTHER)).toBe(false)
    expect(isSameAvatarImage('', '')).toBe(false)
  })
})

describe('AvatarUrlStabilizer', () => {
  it('keeps a stable URL string while the image is unchanged', () => {
    const s = new AvatarUrlStabilizer()
    const first = s.stabilize('tiktok:123', TT_P16)
    expect(first).toBe(TT_P16)
    // Same image, re-signed — must return the ORIGINAL string so <img src> is stable.
    expect(s.stabilize('tiktok:123', TT_P19)).toBe(TT_P16)
  })

  it('adopts a genuinely new image', () => {
    const s = new AvatarUrlStabilizer()
    s.stabilize('tiktok:123', TT_P16)
    expect(s.stabilize('tiktok:123', TT_OTHER)).toBe(TT_OTHER)
  })

  it('reuses the last known URL when an event arrives with no avatar', () => {
    const s = new AvatarUrlStabilizer()
    s.stabilize('tiktok:123', TT_P16)
    expect(s.stabilize('tiktok:123', undefined)).toBe(TT_P16)
    expect(s.stabilize('tiktok:123', '')).toBe(TT_P16)
  })

  it('scopes memory per viewer', () => {
    const s = new AvatarUrlStabilizer()
    s.stabilize('tiktok:123', TT_P16)
    expect(s.stabilize('tiktok:999', TT_OTHER)).toBe(TT_OTHER)
    expect(s.stabilize('tiktok:123', TT_P19)).toBe(TT_P16)
  })

  it('evicts oldest entries past the cap without breaking active viewers', () => {
    const s = new AvatarUrlStabilizer(2)
    s.stabilize('a', TT_P16)
    s.stabilize('b', TT_OTHER)
    s.stabilize('c', TT_P16) // evicts 'a'
    // 'a' forgotten → re-adopts fresh; 'c' still stable.
    expect(s.stabilize('a', TT_P19)).toBe(TT_P19)
    expect(s.stabilize('c', TT_P19)).toBe(TT_P16)
  })
})
