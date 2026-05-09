import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'

const execAsync = promisify(exec)

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
      // Map modifiers to SendKeys syntax
      // Ctrl = ^, Alt = %, Shift = +
      let modPrefix = ''
      if (modifiers.includes('ctrl')) modPrefix += '^'
      if (modifiers.includes('alt')) modPrefix += '%'
      if (modifiers.includes('shift')) modPrefix += '+'

      // Special key mapping
      const keyMap: Record<string, string> = {
        'space': ' ',
        'enter': '{ENTER}',
        'tab': '{TAB}',
        'esc': '{ESC}',
        'up': '{UP}',
        'down': '{DOWN}',
        'left': '{LEFT}',
        'right': '{RIGHT}',
        'f1': '{F1}',
        'f2': '{F2}',
        'f3': '{F3}',
        'f4': '{F4}',
        'f5': '{F5}',
        'f6': '{F6}',
        'f7': '{F7}',
        'f8': '{F8}',
        'f9': '{F9}',
        'f10': '{F10}',
        'f11': '{F11}',
        'f12': '{F12}',
      }

      const finalKey = keyMap[key.toLowerCase()] || key
      const command = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${modPrefix}${finalKey}")`
      
      await execAsync(`powershell -Command "${command}"`)
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
}
