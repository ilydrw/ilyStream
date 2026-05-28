import { shell } from 'electron'
import { pathToFileURL } from 'url'

export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'mailto:') return true
    if (url.protocol !== 'http:') return false
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

export function isSameOriginUrl(value: string, baseUrl: string): boolean {
  try {
    return new URL(value).origin === new URL(baseUrl).origin
  } catch {
    return false
  }
}

export function openExternalSafely(value: string): void {
  if (!isSafeExternalUrl(value)) {
    console.warn(`[main] Blocked unsafe external URL: ${value}`)
    return
  }

  void shell.openExternal(value)
}

export function isProductionAppFileUrl(value: string, loadUrl: string): boolean {
  try {
    const url = new URL(value)
    const appUrl = new URL(pathToFileURL(loadUrl).toString())
    return url.protocol === 'file:' && url.pathname === appUrl.pathname
  } catch {
    return false
  }
}
