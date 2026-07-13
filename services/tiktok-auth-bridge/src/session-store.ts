import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { StoredTikTokSession, TikTokSessionStore } from './types.js'

interface EncryptedEnvelope {
  version: 1
  iv: string
  tag: string
  ciphertext: string
}

type SessionRecord = Record<string, StoredTikTokSession>

export class EncryptedFileTikTokSessionStore implements TikTokSessionStore {
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly filePath: string,
    private readonly encryptionKey: Buffer
  ) {
    if (encryptionKey.byteLength !== 32) {
      throw new Error('TikTok bridge encryption key must contain exactly 32 bytes.')
    }
  }

  async get(tokenHash: string): Promise<StoredTikTokSession | undefined> {
    await this.mutationQueue
    const sessions = await this.readSessions()
    return sessions[tokenHash]
  }

  set(tokenHash: string, session: StoredTikTokSession): Promise<void> {
    return this.mutate((sessions) => {
      sessions[tokenHash] = session
    })
  }

  delete(tokenHash: string): Promise<void> {
    return this.mutate((sessions) => {
      delete sessions[tokenHash]
    })
  }

  private mutate(change: (sessions: SessionRecord) => void): Promise<void> {
    const operation = this.mutationQueue.then(async () => {
      const sessions = await this.readSessions()
      change(sessions)
      await this.writeSessions(sessions)
    })
    this.mutationQueue = operation.catch(() => undefined)
    return operation
  }

  private async readSessions(): Promise<SessionRecord> {
    let contents: string
    try {
      contents = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }

    const envelope = JSON.parse(contents) as Partial<EncryptedEnvelope>
    if (
      envelope.version !== 1 ||
      !envelope.iv ||
      !envelope.tag ||
      !envelope.ciphertext
    ) {
      throw new Error('TikTok bridge session store has an invalid encrypted envelope.')
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(envelope.iv, 'base64url')
    )
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
      decipher.final()
    ]).toString('utf8')
    return JSON.parse(plaintext) as SessionRecord
  }

  private async writeSessions(sessions: SessionRecord): Promise<void> {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(sessions), 'utf8'),
      cipher.final()
    ])
    const envelope: EncryptedEnvelope = {
      version: 1,
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url')
    }

    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(temporaryPath, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryPath, this.filePath)
  }
}

export class MemoryTikTokSessionStore implements TikTokSessionStore {
  private readonly sessions = new Map<string, StoredTikTokSession>()

  async get(tokenHash: string): Promise<StoredTikTokSession | undefined> {
    return this.sessions.get(tokenHash)
  }

  async set(tokenHash: string, session: StoredTikTokSession): Promise<void> {
    this.sessions.set(tokenHash, session)
  }

  async delete(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash)
  }
}
