import { app } from 'electron'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { dirname, join } from 'path'

const requireNative = createRequire(import.meta.url)

interface SecureStoreAddon {
  secureStoreIsAvailable(): boolean
  secureStoreEncrypt(value: string): Buffer | null
  secureStoreDecrypt(value: Buffer): string | null
}

let addon: SecureStoreAddon | null | undefined

function loadAddon(): SecureStoreAddon | null {
  if (addon !== undefined) return addon

  // Native addons are built against Electron's N-API runtime. Never attempt
  // to load one from plain Node (including Vitest), where it may be ABI
  // incompatible and where safeStorage remains the correct test fallback.
  if (!process.versions.electron) {
    addon = null
    return addon
  }

  const appPath = app.getAppPath()
  const candidates = [
    join(process.resourcesPath ?? '', 'native-engine', 'ilystream_napi.node'),
    join(appPath, 'native', 'engine', 'build', 'Release', 'ilystream_napi.node'),
    join(process.cwd(), 'native', 'engine', 'build', 'Release', 'ilystream_napi.node')
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    addon = null
    return addon
  }

  try {
    if (process.platform === 'win32') {
      const separator = ';'
      const directory = dirname(found)
      if (!process.env.PATH?.split(separator).includes(directory)) {
        process.env.PATH = `${directory}${separator}${process.env.PATH ?? ''}`
      }
    }
    const loaded = requireNative(found) as SecureStoreAddon
    addon = loaded.secureStoreIsAvailable() ? loaded : null
  } catch (error) {
    process.stderr.write(`[security] native secure store unavailable: ${(error as Error).message}\n`)
    addon = null
  }
  return addon
}

/** Encrypt a value with the platform keychain, when this build supports it. */
export function encryptWithNativeSecureStore(value: string): Buffer | null {
  try {
    return loadAddon()?.secureStoreEncrypt(value) ?? null
  } catch {
    return null
  }
}

/** Decrypt a value previously returned by encryptWithNativeSecureStore. */
export function decryptWithNativeSecureStore(value: Buffer): string | null {
  try {
    return loadAddon()?.secureStoreDecrypt(value) ?? null
  } catch {
    return null
  }
}
