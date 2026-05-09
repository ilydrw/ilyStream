import { app } from 'electron'
import { EventEmitter } from 'events'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'fs'
import { basename, join, extname } from 'path'

export interface AssetFile {
  id: string
  name: string
  path: string
  type: 'image' | 'video' | 'audio'
}

export class AssetService extends EventEmitter {
  private assetsDir: string

  constructor() {
    super()
    this.assetsDir = join(app.getPath('userData'), 'assets')
    if (!existsSync(this.assetsDir)) {
      mkdirSync(this.assetsDir, { recursive: true })
    }
  }

  getAllImages(): AssetFile[] {
    if (!existsSync(this.assetsDir)) return []
    const files = readdirSync(this.assetsDir)
    return files
      .filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
      .map((f) => ({
        id: f,
        name: f,
        path: join(this.assetsDir, f),
        type: 'image'
      }))
  }

  uploadImage(sourcePath: string): AssetFile {
    const ext = extname(sourcePath).toLowerCase()
    // Prepend timestamp to avoid collisions
    const fileName = `${Date.now()}_${basename(sourcePath)}`
    
    if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(ext)) {
      throw new Error('Only image files (PNG, JPG, GIF, WEBP) are supported.')
    }

    if (!existsSync(sourcePath)) {
      throw new Error('Image file was not found.')
    }

    const destPath = join(this.assetsDir, fileName)
    copyFileSync(sourcePath, destPath)

    return {
      id: fileName,
      name: fileName,
      path: destPath,
      type: 'image'
    }
  }

  deleteAsset(id: string): void {
    // Basic security: only allow files in the assets directory
    if (id !== basename(id)) return
    
    const filePath = join(this.assetsDir, id)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }
  
  renameAsset(id: string, newName: string): AssetFile {
    if (id !== basename(id)) throw new Error('Invalid asset ID')
    
    // Ensure new name has correct extension
    const ext = extname(id)
    let finalName = newName
    if (!finalName.toLowerCase().endsWith(ext.toLowerCase())) {
      finalName += ext
    }
    
    // Security check for new name
    if (finalName !== basename(finalName)) throw new Error('Invalid new name')
    
    const oldPath = join(this.assetsDir, id)
    const newPath = join(this.assetsDir, finalName)
    
    if (!existsSync(oldPath)) throw new Error('Asset not found')
    if (existsSync(newPath)) throw new Error('A file with that name already exists')
    
    renameSync(oldPath, newPath)
    
    return {
      id: finalName,
      name: finalName,
      path: newPath,
      type: 'image'
    }
  }

  /** Convert a local asset ID to a Data URL for the overlay */
  getAssetDataUrl(id: string): string | null {
    if (id !== basename(id)) return null
    
    const filePath = join(this.assetsDir, id)
    if (!existsSync(filePath)) return null

    const ext = extname(filePath).toLowerCase().replace('.', '')
    let mimeType = `image/${ext}`
    if (ext === 'jpg') mimeType = 'image/jpeg'
    if (ext === 'svg') mimeType = 'image/svg+xml'

    const base64 = readFileSync(filePath).toString('base64')
    return `data:${mimeType};base64,${base64}`
  }

  /** Resolve an asset ID to its absolute filesystem path */
  getAssetPath(id: string): string | null {
    if (id !== basename(id)) return null
    const filePath = join(this.assetsDir, id)
    return existsSync(filePath) ? filePath : null
  }
}
