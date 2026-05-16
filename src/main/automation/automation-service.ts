import { execFile } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'

const execFileAsync = promisify(execFile)

const KEY_MAP: Record<string, string> = {
  space: ' ',
  enter: '{ENTER}',
  tab: '{TAB}',
  esc: '{ESC}',
  escape: '{ESC}',
  up: '{UP}',
  down: '{DOWN}',
  left: '{LEFT}',
  right: '{RIGHT}',
  backspace: '{BACKSPACE}',
  delete: '{DELETE}',
  home: '{HOME}',
  end: '{END}',
  pageup: '{PGUP}',
  pagedown: '{PGDN}',
  f1: '{F1}',
  f2: '{F2}',
  f3: '{F3}',
  f4: '{F4}',
  f5: '{F5}',
  f6: '{F6}',
  f7: '{F7}',
  f8: '{F8}',
  f9: '{F9}',
  f10: '{F10}',
  f11: '{F11}',
  f12: '{F12}'
}

const MODIFIER_PREFIX: Record<string, string> = {
  ctrl: '^',
  alt: '%',
  shift: '+'
}

export interface KeystrokeMapping {
  key: string
  modifiers: string[]
}

export class AutomationService {
  /**
   * Sends a keystroke using PowerShell SendKeys.
   * This is highly reliable on Windows and avoids native build issues.
   */
  async sendKeystroke(key: string, modifiers: string[] = []): Promise<void> {
    try {
      const finalKey = this.normalizeKey(key)
      if (!finalKey) {
        log.warn(`[Automation] Rejected unsupported keystroke key: ${key}`)
        return
      }

      const modPrefix = modifiers
        .filter((modifier) => Object.prototype.hasOwnProperty.call(MODIFIER_PREFIX, modifier))
        .map((modifier) => MODIFIER_PREFIX[modifier])
        .join('')

      const command = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${modPrefix}${finalKey}")`

      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true })
      log.info(`[Automation] Sent keystroke: ${modPrefix}${finalKey}`)
    } catch (error) {
      log.error('[Automation] Failed to send keystroke:', error)
    }
  }

  async handleTrigger(trigger: string, type: 'chat-command' | 'gift', mappings: any[]): Promise<void> {
    const relevant = mappings.filter(m => m.enabled && m.type === type && m.trigger.toLowerCase() === trigger.toLowerCase())
    for (const mapping of relevant) {
      await this.sendKeystroke(mapping.key, mapping.modifiers)
    }
  }

  private normalizeKey(key: string): string | null {
    const normalized = String(key || '').trim().toLowerCase()
    if (!normalized) return null
    if (KEY_MAP[normalized]) return KEY_MAP[normalized]
    if (/^[a-z0-9]$/.test(normalized)) return normalized
    return null
  }
}
