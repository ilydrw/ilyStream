import { app } from 'electron'
import { EventEmitter } from 'events'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'fs'
import { basename, join } from 'path'
import { pathToFileURL } from 'url'
import { Database } from '../db/database'

export interface SoundFile {
  id: string
  name: string
  path: string
  emoji?: string
}

/**
 * Sound libraries are separate per purpose: soundboard deck ('board'), alert
 * sounds ('alerts'), and per-viewer join sounds ('join').
 */
export type SoundCategory = 'alerts' | 'board' | 'join'

const SOUND_CATEGORIES: SoundCategory[] = ['alerts', 'board', 'join']

export class SoundboardService extends EventEmitter {
  private soundsDir: string
  private db: Database

  constructor(db: Database) {
    super()
    this.db = db
    this.soundsDir = join(app.getPath('userData'), 'sounds')

    // Ensure category subdirectories exist
    SOUND_CATEGORIES.forEach(cat => {
      const p = join(this.soundsDir, cat)
      if (!existsSync(p)) mkdirSync(p, { recursive: true })
    })
  }

  getAllSounds(category?: SoundCategory): SoundFile[] {
    const targetDir = category ? join(this.soundsDir, category) : this.soundsDir
    if (!existsSync(targetDir)) return []

    // If no category, we need to scan subdirectories
    if (!category) {
      return SOUND_CATEGORIES.flatMap((cat) => this.getAllSounds(cat))
    }

    const files = readdirSync(targetDir)
    const metadata = this.db.getAllSoundMetadata()

    return files
      .filter((f) => /\.(mp3|wav)$/i.test(f))
      .map((f) => {
        const id = `${category}/${f}`
        return {
          id,
          name: f,
          path: join(targetDir, f),
          emoji: metadata[id]?.emoji
        }
      })
  }

  uploadSound(sourcePath: string, category: SoundCategory = 'board'): SoundFile {
    const fileName = basename(sourcePath)
    if (!/\.(mp3|wav)$/i.test(fileName)) {
      throw new Error('Only MP3 and WAV files are supported for event sounds.')
    }

    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      throw new Error('Sound file was not found.')
    }

    const targetDir = join(this.soundsDir, category)
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

    const destPath = join(targetDir, fileName)

    copyFileSync(sourcePath, destPath)

    return {
      id: `${category}/${fileName}`,
      name: fileName,
      path: destPath
    }
  }

  deleteSound(id: string): void {
    const filePath = this.getSoundPath(id)
    if (!filePath) return

    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
    this.db.setSoundEmoji(id, null)
  }

  renameSound(id: string, newName: string): SoundFile {
    const oldPath = this.getSoundPath(id)
    if (!oldPath || !existsSync(oldPath)) throw new Error('Sound not found')

    const category = SOUND_CATEGORIES.find((cat) => id.startsWith(`${cat}/`)) || 'board'
    const ext = id.split('.').pop() || 'mp3'
    let finalBaseName = newName
    if (!finalBaseName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
      finalBaseName += `.${ext}`
    }

    if (finalBaseName !== basename(finalBaseName)) throw new Error('Invalid new name')

    const newPath = join(this.soundsDir, category, finalBaseName)
    if (newPath !== oldPath) {
      if (existsSync(newPath)) throw new Error('A file with that name already exists')
      renameSync(oldPath, newPath)
    }

    const newId = `${category}/${finalBaseName}`
    const emoji = this.db.getSoundEmoji(id)
    if (emoji) {
      this.db.setSoundEmoji(id, null)
      this.db.setSoundEmoji(newId, emoji)
    }

    return {
      id: newId,
      name: finalBaseName,
      path: newPath,
      emoji: emoji || undefined
    }
  }

  playSound(id: string, volume = 1.0): boolean {
    const filePath = this.getSoundPath(id)
    if (!filePath || !existsSync(filePath)) {
      console.warn(`[soundboard] Sound not found: ${id}`)
      return false
    }

    const mimeType = getAudioMimeType(filePath)
    const dataUrl = `data:${mimeType};base64,${readFileSync(filePath).toString('base64')}`

    this.emit('action:play-sound', {
      type: 'play_sound',
      id,
      filePath,
      fileUrl: pathToFileURL(filePath).toString(),
      dataUrl,
      mimeType,
      volume: clampVolume(volume)
    })

    return true
  }

  /**
   * Panic-stop. Emits an event that the renderer's playback hook listens for
   * and uses to halt every currently-playing `<audio>` element it spawned.
   */
  stopAll(): void {
    this.emit('action:stop-all-sounds')
  }

  getSoundPath(id: string): string | null {
    const soundId = normalizeSoundId(id)
    if (!soundId) return null

    if (soundId.category) {
      const filePath = join(this.soundsDir, soundId.category, soundId.fileName)
      return existsSync(filePath) ? filePath : null
    }

    for (const category of SOUND_CATEGORIES) {
      const candidatePath = join(this.soundsDir, category, soundId.fileName)
      if (existsSync(candidatePath)) return candidatePath
    }

    const legacyPath = join(this.soundsDir, soundId.fileName)
    return existsSync(legacyPath) ? legacyPath : null
  }
}

function normalizeSoundId(value: string): { category: SoundCategory | null; fileName: string } | null {
  if (typeof value !== 'string' || !value.trim()) return null

  const normalized = value.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  let category: SoundCategory | null = null
  let fileName = ''

  if (parts.length === 1) {
    fileName = parts[0]
  } else if (parts.length === 2 && SOUND_CATEGORIES.includes(parts[0] as SoundCategory)) {
    category = parts[0] as SoundCategory
    fileName = parts[1]
  } else {
    return null
  }

  if (fileName !== basename(fileName)) return null
  if (!/\.(mp3|wav)$/i.test(fileName)) return null

  return { category, fileName }
}

function clampVolume(value: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 1
  return Math.min(Math.max(numericValue, 0), 1)
}

function getAudioMimeType(filePath: string): string {
  return /\.wav$/i.test(filePath) ? 'audio/wav' : 'audio/mpeg'
}
