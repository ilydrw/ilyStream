import { app, protocol, net } from 'electron'
import { isAbsolute, relative, resolve, join } from 'path'
import { stat } from 'fs/promises'
import { pathToFileURL } from 'url'

export function isSafePathWithin(root: string, filePath: string): boolean {
  const relativePath = relative(resolve(root), resolve(filePath))
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

export function resolveAssetPath(root: string, assetId: string): string | null {
  const filePath = resolve(root, assetId)
  return isSafePathWithin(root, filePath) ? filePath : null
}

export async function isReadableFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

export function registerAssetProtocol(): void {
  protocol.handle('asset', async (request) => {
    try {
      const url = new URL(request.url)
      let assetId = decodeURIComponent(url.hostname + url.pathname)
      assetId = assetId.replace(/^\/+/, '').replace(/\/+$/, '')

      if (assetId.startsWith('app/')) {
        assetId = assetId.slice(4)
      }

      console.log(`[AssetProtocol] Resolving: ${assetId}`)

      let assetPath: string | null = null
      // 1. AppData Assets (Try root, then sounds/assets subdirs)
      const userData = app.getPath('userData')
      const userRoots = [
        userData,
        join(userData, 'sounds'),
        join(userData, 'assets')
      ]

      for (const root of userRoots) {
        const filePath = resolveAssetPath(root, assetId)
        if (filePath && await isReadableFile(filePath)) {
          assetPath = filePath
          break
        }
      }

      // 4. Resources
      if (!assetPath) {
        const resourceRoots = [
          join(__dirname, '../../resources'),
          join(app.getAppPath(), 'resources'),
          process.resourcesPath,
          join(process.resourcesPath, 'resources'),
          join(process.cwd(), 'resources')
        ]
        for (const root of resourceRoots) {
          const filePath = resolveAssetPath(root, assetId)
          if (filePath && await isReadableFile(filePath)) {
            assetPath = filePath
            break
          }
        }
      }

      if (assetPath) {
        return net.fetch(pathToFileURL(assetPath).toString())
      }

      console.warn(`[AssetProtocol] Asset not found: ${assetId}`)
      return new Response('Not Found', { status: 404 })
    } catch (err) {
      console.error('[AssetProtocol] Error:', err)
      return new Response('Internal Error', { status: 500 })
    }
  })
}
