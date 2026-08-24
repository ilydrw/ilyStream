import { app, shell, ipcMain } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { readdirSync, statSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { mkdir, readFile, rename, unlink } from 'fs/promises'
import { join, basename, extname, resolve, relative, sep } from 'path'
import ffmpegPath from 'ffmpeg-static'

const RECORDING_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.flv'])
const RESOLVED_FFMPEG_PATH = (ffmpegPath || 'ffmpeg').replace('app.asar', 'app.asar.unpacked')

export class RecordingsService {
  private recordingsFolder: string
  private readonly defaultRecordingsFolder: string
  private readonly thumbnailCacheFolder: string
  private readonly thumbnailJobs = new Map<string, Promise<string | null>>()

  constructor() {
    this.defaultRecordingsFolder = join(app.getPath('videos'), 'ilyStream', 'Recordings')
    this.recordingsFolder = this.defaultRecordingsFolder
    this.thumbnailCacheFolder = join(app.getPath('userData'), 'recording-thumbnails')
    this.ensureDirectory()
    this.registerIpcHandlers()
  }

  public setRecordingsFolder(folder: string | null | undefined): void {
    const trimmed = typeof folder === 'string' ? folder.trim() : ''
    this.recordingsFolder = trimmed || this.defaultRecordingsFolder
    this.ensureDirectory()
    this.thumbnailJobs.clear()
  }

  private ensureDirectory() {
    if (!existsSync(this.recordingsFolder)) {
      mkdirSync(this.recordingsFolder, { recursive: true })
    }
  }

  private registerIpcHandlers() {
    ipcMain.handle('recordings:list', () => this.getRecordings())
    ipcMain.handle('recordings:open-folder', () => shell.openPath(this.recordingsFolder))
    ipcMain.handle('recordings:play', (_, idOrPath: string) => {
      const filePath = this.resolveRecordingPath(idOrPath)
      if (!filePath) return 'Invalid recording path'
      return shell.openPath(filePath)
    })
    ipcMain.handle('recordings:thumbnail', (_, idOrPath: string) => {
      return this.getThumbnailDataUrl(idOrPath)
    })
    ipcMain.handle('recordings:delete', (_, idOrPath: string) => {
      try {
        const filePath = this.resolveRecordingPath(idOrPath)
        if (!filePath) return { success: false, error: 'Invalid recording path' }
        if (existsSync(filePath)) {
          const stats = statSync(filePath)
          if (!stats.isFile()) return { success: false, error: 'Recording is not a file' }
          const thumbnailPath = this.getThumbnailCachePath(filePath, stats.size, stats.mtimeMs)
          unlinkSync(filePath)
          void unlink(thumbnailPath).catch(() => {})
          return { success: true }
        }
        return { success: false, error: 'File not found' }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    })
  }

  public getRecordings() {
    this.ensureDirectory()
    try {
      const files = readdirSync(this.recordingsFolder)
      const recordings = files
        .filter(f => RECORDING_EXTENSIONS.has(extname(f).toLowerCase()))
        .map(f => {
          const path = join(this.recordingsFolder, f)
          const stats = statSync(path)
          return {
            id: f,
            name: f,
            path: path,
            size: stats.size,
            createdAt: stats.birthtimeMs,
            extension: extname(f).slice(1)
          }
        })
        .sort((a, b) => b.createdAt - a.createdAt)

      return recordings
    } catch (err) {
      console.error('[RecordingsService] Failed to list recordings:', err)
      return []
    }
  }

  public async getThumbnailDataUrl(idOrPath: string): Promise<string | null> {
    const filePath = this.resolveRecordingPath(idOrPath)
    if (!filePath || !existsSync(filePath)) return null

    const stats = statSync(filePath)
    if (!stats.isFile()) return null

    const cachePath = this.getThumbnailCachePath(filePath, stats.size, stats.mtimeMs)
    const existingJob = this.thumbnailJobs.get(cachePath)
    if (existingJob) return existingJob

    const job = this.loadOrCreateThumbnail(filePath, cachePath)
      .finally(() => this.thumbnailJobs.delete(cachePath))
    this.thumbnailJobs.set(cachePath, job)
    return job
  }

  private async loadOrCreateThumbnail(filePath: string, cachePath: string): Promise<string | null> {
    let tempPath: string | null = null

    try {
      if (existsSync(cachePath)) {
        return toJpegDataUrl(await readFile(cachePath))
      }

      await mkdir(this.thumbnailCacheFolder, { recursive: true })
      tempPath = `${cachePath}.${randomUUID()}.jpg`

      try {
        await createThumbnail(filePath, tempPath, 1)
      } catch {
        // Very short clips may not have a frame at one second.
        await createThumbnail(filePath, tempPath, 0)
      }

      await rename(tempPath, cachePath)
      return toJpegDataUrl(await readFile(cachePath))
    } catch (error) {
      console.warn(
        `[RecordingsService] Failed to generate thumbnail for ${basename(filePath)}:`,
        error instanceof Error ? error.message : error
      )
      return null
    } finally {
      if (tempPath) {
        await unlink(tempPath).catch(() => {})
      }
    }
  }

  private getThumbnailCachePath(filePath: string, size: number, mtimeMs: number): string {
    const key = createHash('sha256')
      .update(`${resolve(filePath)}\0${size}\0${mtimeMs}`)
      .digest('hex')
    return join(this.thumbnailCacheFolder, `${key}.jpg`)
  }

  private resolveRecordingPath(idOrPath: string): string | null {
    if (typeof idOrPath !== 'string' || !idOrPath.trim()) return null

    const fileName = basename(idOrPath)
    if (!fileName || fileName !== basename(fileName)) return null
    if (!RECORDING_EXTENSIONS.has(extname(fileName).toLowerCase())) return null

    const folder = resolve(this.recordingsFolder)
    const filePath = resolve(folder, fileName)
    const rel = relative(folder, filePath)
    if (rel.startsWith('..') || rel === '..' || rel.includes(`..${sep}`) || resolve(rel) === rel) return null
    return filePath
  }
}

function createThumbnail(inputPath: string, outputPath: string, seekSeconds: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-ss', String(seekSeconds),
      '-i', inputPath,
      '-frames:v', '1',
      '-vf', 'scale=640:-2:force_original_aspect_ratio=decrease',
      '-q:v', '3',
      outputPath
    ]
    const child = spawn(RESOLVED_FFMPEG_PATH, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let stderr = ''

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 8_000) stderr += chunk.toString()
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`))
    })
  })
}

function toJpegDataUrl(data: Buffer): string {
  return `data:image/jpeg;base64,${data.toString('base64')}`
}
