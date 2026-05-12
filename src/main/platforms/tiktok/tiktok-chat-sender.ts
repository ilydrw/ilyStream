import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

export interface TikTokSenderStatus {
  isWindowOpen: boolean
  isLoggedIn: boolean
  isChatReady: boolean
  lastMessageSentAt?: number
}

export class TikTokChatSender {
  private window: BrowserWindow | null = null
  private isChatReady = false
  private lastMessageSentAt = 0

  constructor() {
    // We'll manage the window lifecycle here
  }

  getStatus(): TikTokSenderStatus {
    return {
      isWindowOpen: !!this.window,
      isLoggedIn: false, // We'll detect this via cookies/DOM
      isChatReady: this.isChatReady,
      lastMessageSentAt: this.lastMessageSentAt || undefined
    }
  }

  async openWindow(): Promise<void> {
    if (this.window) {
      this.window.focus()
      return
    }

    this.window = new BrowserWindow({
      width: 450,
      height: 800,
      title: 'TikTok Chat Sender (Manual Login)',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:tiktok-chat-sender',
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.window.on('closed', () => {
      this.window = null
      this.isChatReady = false
    })

    // Load TikTok. User needs to login and navigate to their LIVE dashboard/chat.
    await this.window.loadURL('https://www.tiktok.com/live/creators/vi/live-center')

    // Start a simple loop to detect if the chat box is present
    this.startDetectionLoop()
  }

  async sendMessage(text: string): Promise<boolean> {
    if (!this.window || !this.isChatReady) {
      console.warn('[tiktok-sender] Attempted to send message but chat is not ready.')
      return false
    }

    try {
      // Robust script to find and type into TikTok chat box
      // Note: TikTok uses complex DOM, so we try multiple common selectors
      const success = await this.window.webContents.executeJavaScript(`(async () => {
        const selectors = [
          'div[data-e2e="chat-input"]',
          'textarea[placeholder*="chat"]',
          '.chat-input-container textarea',
          'div[contenteditable="true"]'
        ];

        let input = null;
        for (const s of selectors) {
          input = document.querySelector(s);
          if (input) break;
        }

        if (!input) return false;

        input.focus();
        
        // For contenteditable or standard inputs
        if (input.tagName === 'DIV') {
          input.innerText = ${JSON.stringify(text)};
        } else {
          input.value = ${JSON.stringify(text)};
        }

        // Trigger input events so the 'Send' button enables
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Small delay to let TikTok's UI react
        await new Promise(r => setTimeout(r, 100));

        // Find and click send button
        const sendButtons = [
          'button[data-e2e="chat-send"]',
          '.chat-send-button',
          'button:has(svg[viewBox*="send"])',
          'button.send-btn'
        ];

        let sendBtn = null;
        for (const s of sendButtons) {
          sendBtn = document.querySelector(s);
          if (sendBtn && !sendBtn.disabled) break;
        }

        if (sendBtn) {
          sendBtn.click();
          return true;
        }

        // Fallback: Press Enter on the input
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        });
        input.dispatchEvent(enterEvent);
        return true;
      })()`)

      if (success) {
        this.lastMessageSentAt = Date.now()
        return true
      }
      return false
    } catch (err) {
      console.error('[tiktok-sender] Failed to inject message:', err)
      return false
    }
  }

  private startDetectionLoop() {
    const interval = setInterval(async () => {
      if (!this.window) {
        clearInterval(interval)
        return
      }

      try {
        const isReady = await this.window.webContents.executeJavaScript(`
          !!(document.querySelector('div[data-e2e="chat-input"]') || 
             document.querySelector('textarea[placeholder*="chat"]') ||
             document.querySelector('div[contenteditable="true"]'))
        `)
        
        if (isReady !== this.isChatReady) {
          this.isChatReady = isReady
          console.log(`[tiktok-sender] Chat readiness changed: ${isReady}`)
        }
      } catch {}
    }, 2000)
  }

  closeWindow() {
    if (this.window) {
      this.window.close()
    }
  }
}
