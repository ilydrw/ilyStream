import { app, shell, ipcMain } from 'electron'
import { readdirSync, statSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join, basename, extname, resolve, relative, sep } from 'path'

const RECORDING_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.flv'])

export class RecordingsService {
  private recordingsFolder: string

  constructor() {
    this.recordingsFolder = join(app.getPath('videos'), 'ilyStream', 'Recordings')
    this.ensureDirectory()
    this.registerIpcHandlers()
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
    ipcMain.handle('recordings:delete', (_, idOrPath: string) => {
      try {
        const filePath = this.resolveRecordingPath(idOrPath)
        if (!filePath) return { success: false, error: 'Invalid recording path' }
        if (existsSync(filePath)) {
          const stats = statSync(filePath)
          if (!stats.isFile()) return { success: false, error: 'Recording is not a file' }
          unlinkSync(filePath)
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
