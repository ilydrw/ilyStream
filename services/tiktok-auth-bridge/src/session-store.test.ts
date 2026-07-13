import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { EncryptedFileTikTokSessionStore } from './session-store.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ))
})

describe('EncryptedFileTikTokSessionStore', () => {
  it('round trips sessions without writing TikTok credentials as plaintext', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ilystream-tiktok-bridge-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'sessions.enc')
    const store = new EncryptedFileTikTokSessionStore(filePath, Buffer.alloc(32, 7))
    const session = {
      account: { openId: 'open-id', displayName: 'Creator' },
      tokens: {
        accessToken: 'highly-sensitive-access-token',
        refreshToken: 'highly-sensitive-refresh-token',
        openId: 'open-id',
        scope: 'user.info.basic',
        accessExpiresAt: 10,
        refreshExpiresAt: 20
      },
      createdAt: 1,
      expiresAt: 20
    }

    await store.set('desktop-token-hash', session)
    await store.set('second-desktop-token-hash', {
      ...session,
      account: { ...session.account, openId: 'second-open-id' }
    })

    expect(await store.get('desktop-token-hash')).toEqual(session)
    expect(await store.get('second-desktop-token-hash')).toMatchObject({
      account: { openId: 'second-open-id' }
    })
    const encryptedContents = await readFile(filePath, 'utf8')
    expect(encryptedContents).not.toContain('highly-sensitive-access-token')
    expect(encryptedContents).not.toContain('highly-sensitive-refresh-token')
    expect(JSON.parse(encryptedContents)).toMatchObject({ version: 1 })
  })
})
