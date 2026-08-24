import { BrowserWindow, shell } from 'electron'
import type { TikTokSenderStatus } from '../../../shared/tiktok-sender'

export type { TikTokSenderStatus } from '../../../shared/tiktok-sender'

declare const document: any
declare const window: any
declare const Event: any
declare const HTMLButtonElement: any
declare const HTMLElement: any
declare const HTMLInputElement: any
declare const HTMLTextAreaElement: any
declare const InputEvent: any
declare const KeyboardEvent: any

const TIKTOK_WEB_FALLBACK_URL = 'https://livecenter.tiktok.com/'
const TIKTOK_OWNED_WEB_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'accounts.tiktok.com',
  'livecenter.tiktok.com'
])
const TIKTOK_BLOCKED_APP_PROTOCOLS = new Set([
  'bytedance:',
  'bytedanceauth:',
  'musically:',
  'snssdk1128:',
  'snssdk1233:',
  'tiktok:',
  'tiktoklive:'
])
const DETECTION_INTERVAL_MS = 2000
const TIKTOK_SENDER_SCRIPT_TIMEOUT_MS = 5000
const TIKTOK_SENDER_RECOVERY_COOLDOWN_MS = 15_000
const TIKTOK_AUTH_COOKIE_NAMES = new Set(['sessionid', 'sessionid_ss', 'sid_tt', 'uid_tt'])

export const TIKTOK_SENDER_MAX_MESSAGE_LENGTH = 150
export const TIKTOK_SENDER_SEND_COOLDOWN_MS = 1500

export interface TikTokSenderMessageValidation {
  ok: boolean
  text: string
  error?: string
}

export interface TikTokCapturedCredentials {
  sessionId: string | null
  ttTargetIdc: string | null
  /** True when a sessionid cookie was present (i.e. the sender is logged in). */
  loggedIn: boolean
}

interface TikTokSenderDomState {
  currentUrl: string
  isOnTikTok: boolean
  hasLoginPrompt: boolean
  hasAccountUi: boolean
  isChatReady: boolean
}

interface TikTokSendScriptResult {
  ok: boolean
  reason?: string
  method?: string
}

export class TikTokChatSender {
  private window: BrowserWindow | null = null
  private detectionTimer: ReturnType<typeof setInterval> | null = null
  private isLoggedIn = false
  private isOnTikTok = false
  private isChatReady = false
  private hasSendCredentials = false
  private currentUrl: string | undefined
  private liveChatUrl: string | null = null
  private lastError: string | undefined
  private lastMessageSentAt = 0
  private lastRecoveryAt = 0
  private sendQueue: Promise<void> = Promise.resolve()
  private refreshPromise: Promise<void> | null = null
  private recoveryPromise: Promise<void> | null = null

  getStatus(): TikTokSenderStatus {
    const now = Date.now()
    const nextSendAvailableAt = this.lastMessageSentAt
      ? this.lastMessageSentAt + TIKTOK_SENDER_SEND_COOLDOWN_MS
      : undefined

    return {
      isWindowOpen: !!this.window,
      isLoggedIn: this.isLoggedIn,
      isChatReady: this.isChatReady,
      hasSendCredentials: this.hasSendCredentials,
      isOnTikTok: this.isOnTikTok,
      currentUrl: this.currentUrl,
      lastMessageSentAt: this.lastMessageSentAt || undefined,
      nextSendAvailableAt: nextSendAvailableAt && nextSendAvailableAt > now ? nextSendAvailableAt : undefined,
      lastError: this.lastError,
      statusMessage: describeTikTokSenderStatus({
        isWindowOpen: !!this.window,
        isOnTikTok: this.isOnTikTok,
        isLoggedIn: this.isLoggedIn,
        isChatReady: this.isChatReady,
        hasSendCredentials: this.hasSendCredentials
      }),
      maxMessageLength: TIKTOK_SENDER_MAX_MESSAGE_LENGTH,
      sendCooldownMs: TIKTOK_SENDER_SEND_COOLDOWN_MS
    }
  }

  async openWindow(username?: string): Promise<void> {
    const liveChatUrl = buildTikTokLiveChatUrl(username)
    if (liveChatUrl) this.liveChatUrl = liveChatUrl

    if (this.window) {
      this.window.focus()
      if (liveChatUrl && !isTikTokLiveChatUrl(this.currentUrl, username)) {
        await this.window.loadURL(liveChatUrl)
      }
      return
    }

    this.window = new BrowserWindow({
      width: 450,
      height: 800,
      title: 'TikTok Host Chat Sender',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:tiktok-chat-sender',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // The sender is commonly minimized beside the Studio during a stream.
        // TikTok's chat page needs its timers/socket kept alive in that state.
        backgroundThrottling: false
      }
    })

    this.window.webContents.setWindowOpenHandler(({ url }) => {
      if (isTikTokOwnedWebUrl(url)) {
        void this.window?.loadURL(url)
        return { action: 'deny' }
      }

      if (isSafeNavigationUrl(url)) {
        shell.openExternal(url).catch((err) => {
          console.warn('[tiktok-sender] Failed to open external URL:', err)
        })
      } else {
        this.lastError = getBlockedNavigationMessage(url)
      }
      return { action: 'deny' }
    })

    this.window.webContents.on('will-navigate', (event, url) => {
      if (!isSafeNavigationUrl(url)) {
        this.lastError = getBlockedNavigationMessage(url)
        event.preventDefault()
      }
    })

    this.window.webContents.on('will-redirect', (event, url) => {
      if (!isSafeNavigationUrl(url)) {
        this.lastError = getBlockedNavigationMessage(url)
        event.preventDefault()
      }
    })

    this.window.webContents.on('will-frame-navigate', (event) => {
      if (event.isMainFrame && !isSafeNavigationUrl(event.url)) {
        this.lastError = getBlockedNavigationMessage(event.url)
        event.preventDefault()
      }
    })

    this.window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
      if (errorCode === -3) return
      if (!isSafeNavigationUrl(validatedUrl)) {
        this.lastError = getBlockedNavigationMessage(validatedUrl)
        return
      }

      this.lastError = `TikTok sender failed to load: ${errorDescription}`
    })

    this.window.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
      if (isMainFrame) this.isChatReady = false
    })

    this.window.webContents.on('did-finish-load', () => {
      void this.requestSenderRefresh()
    })

    this.window.webContents.on('render-process-gone', (_event, details) => {
      this.isChatReady = false
      this.lastError = `TikTok sender page stopped: ${details.reason}`
      void this.recoverSenderPage(this.lastError)
    })

    this.window.on('unresponsive', () => {
      this.isChatReady = false
      this.lastError = 'TikTok sender page became unresponsive'
      void this.recoverSenderPage(this.lastError)
    })

    this.window.on('closed', () => {
      this.window = null
      this.stopDetectionLoop()
      this.isLoggedIn = false
      this.isOnTikTok = false
      this.isChatReady = false
      this.hasSendCredentials = false
      this.currentUrl = undefined
      this.liveChatUrl = null
      this.refreshPromise = null
      this.recoveryPromise = null
    })

    try {
      await this.window.loadURL(liveChatUrl || TIKTOK_WEB_FALLBACK_URL)
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      await this.window.loadURL(TIKTOK_WEB_FALLBACK_URL)
    }
    this.startDetectionLoop()
  }

  async sendMessage(text: string): Promise<boolean> {
    const validation = validateTikTokSenderMessage(text)
    if (!validation.ok) {
      this.lastError = validation.error
      console.warn('[tiktok-sender] Message rejected:', validation.error)
      return false
    }

    const sendTask = this.sendQueue.then(() => this.sendValidatedMessage(validation.text))
    this.sendQueue = sendTask.then(() => undefined, () => undefined)
    return sendTask
  }

  closeWindow(): void {
    if (this.window) {
      this.window.close()
    }
  }

  private async sendValidatedMessage(text: string): Promise<boolean> {
    if (!this.window || this.window.isDestroyed() || !this.isChatReady) {
      this.lastError = this.getUnavailableReason()
      console.warn('[tiktok-sender] Attempted to send message but sender is not ready:', this.lastError)
      return false
    }

    try {
      const cooldownMs = getTikTokSenderCooldownMs(this.lastMessageSentAt)
      if (cooldownMs > 0) {
        await delay(cooldownMs)
      }

      const result = await withTimeout(
        this.window.webContents.executeJavaScript(
          `(${sendMessageInTikTokPage.toString()})(${JSON.stringify(text)})`
        ) as Promise<TikTokSendScriptResult>,
        TIKTOK_SENDER_SCRIPT_TIMEOUT_MS,
        'TikTok sender page did not respond while sending'
      )

      if (result?.ok) {
        this.lastMessageSentAt = Date.now()
        this.lastError = undefined
        console.log(`[tiktok-sender] Chat send confirmed via ${result.method || 'unknown'}`)
        return true
      }

      this.lastError = result?.reason || 'TikTok did not accept the chat message'
      this.isChatReady = false
      console.warn('[tiktok-sender] Message send failed:', this.lastError)
      void this.recoverSenderPage(this.lastError)
      return false
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      this.isChatReady = false
      console.error('[tiktok-sender] Failed to inject message:', err)
      void this.recoverSenderPage(this.lastError)
      return false
    }
  }

  private startDetectionLoop(): void {
    this.stopDetectionLoop()
    void this.requestSenderRefresh()
    this.detectionTimer = setInterval(() => {
      void this.requestSenderRefresh()
    }, DETECTION_INTERVAL_MS)
  }

  private stopDetectionLoop(): void {
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer)
      this.detectionTimer = null
    }
  }

  private requestSenderRefresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = this.refreshSenderState().finally(() => {
      this.refreshPromise = null
    })
    return this.refreshPromise
  }

  private async refreshSenderState(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      this.window = null
      this.isLoggedIn = false
      this.isOnTikTok = false
      this.isChatReady = false
      this.hasSendCredentials = false
      this.currentUrl = undefined
      this.stopDetectionLoop()
      return
    }

    try {
      // Electron defers executeJavaScript until the main frame stops loading by
      // attaching a did-stop-loading listener. Do not start probes while a
      // TikTok navigation is still in progress: a timed-out wrapper cannot
      // cancel that underlying wait and repeated polls would retain listeners.
      if (this.window.webContents.isLoadingMainFrame()) {
        this.isChatReady = false
        return
      }

      const previousUnavailableReason = this.getUnavailableReason()
      const [domState, credentials] = await Promise.all([
        this.window.webContents.executeJavaScript(
          `(${detectTikTokSenderStateInPage.toString()})()`
        ) as Promise<TikTokSenderDomState>,
        this.readTikTokAuthCredentials()
      ])

      this.currentUrl = domState.currentUrl
      this.isOnTikTok = domState.isOnTikTok
      this.isLoggedIn = this.isOnTikTok && !domState.hasLoginPrompt && (domState.hasAccountUi || credentials.loggedIn)
      this.isChatReady = this.isLoggedIn && domState.isChatReady
      this.hasSendCredentials = hasTikTokSendCredentials(credentials)

      if ((this.isChatReady || this.hasSendCredentials) && this.lastError === previousUnavailableReason) {
        this.lastError = undefined
      }
    } catch (error) {
      this.isChatReady = false
      this.hasSendCredentials = false
      this.lastError = error instanceof Error ? error.message : String(error)
    }
  }

  private async recoverSenderPage(reason: string): Promise<void> {
    if (this.recoveryPromise) return this.recoveryPromise
    if (!this.window || this.window.isDestroyed() || !this.liveChatUrl) return
    if (Date.now() - this.lastRecoveryAt < TIKTOK_SENDER_RECOVERY_COOLDOWN_MS) return

    const senderWindow = this.window
    const liveChatUrl = this.liveChatUrl
    this.lastRecoveryAt = Date.now()
    this.recoveryPromise = (async () => {
      console.warn(`[tiktok-sender] Reloading the public LIVE chat after sender failure: ${reason}`)
      try {
        await senderWindow.loadURL(liveChatUrl)
        if (this.window === senderWindow && !senderWindow.isDestroyed()) {
          await this.requestSenderRefresh()
        }
      } catch (error) {
        if (this.window === senderWindow) {
          this.lastError = error instanceof Error ? error.message : String(error)
        }
      } finally {
        this.recoveryPromise = null
      }
    })()

    return this.recoveryPromise
  }

  private async readTikTokAuthCredentials(): Promise<TikTokCapturedCredentials> {
    if (!this.window || this.window.isDestroyed()) {
      return { sessionId: null, ttTargetIdc: null, loggedIn: false }
    }

    // The sender uses an isolated partition, so reading the whole jar is both
    // scoped and necessary: TikTok may host-only either cookie on
    // livecenter.tiktok.com instead of www.tiktok.com.
    const cookies = await this.window.webContents.session.cookies.get({})
    return pickTikTokCredentialsFromCookies(
      cookies.filter((cookie) => TIKTOK_AUTH_COOKIE_NAMES.has(cookie.name) || cookie.name === 'tt-target-idc')
    )
  }

  /**
   * Pulls the connector's sending credentials straight from the logged-in sender
   * session — the `sessionid` cookie and the `tt-target-idc` data-center hint —
   * so the streamer never has to hand-extract them from browser cookies.
   */
  async captureAuthCredentials(): Promise<TikTokCapturedCredentials> {
    if (!this.window || this.window.isDestroyed()) {
      return { sessionId: null, ttTargetIdc: null, loggedIn: false }
    }

    try {
      const credentials = await this.readTikTokAuthCredentials()
      this.hasSendCredentials = hasTikTokSendCredentials(credentials)
      if (credentials.loggedIn && this.isOnTikTok) this.isLoggedIn = true
      return credentials
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      return { sessionId: null, ttTargetIdc: null, loggedIn: false }
    }
  }

  private getUnavailableReason(): string {
    return describeTikTokSenderStatus({
      isWindowOpen: !!this.window,
      isOnTikTok: this.isOnTikTok,
      isLoggedIn: this.isLoggedIn,
      isChatReady: this.isChatReady,
      hasSendCredentials: this.hasSendCredentials
    })
  }
}

/**
 * Extracts the connector's sending credentials from a set of TikTok cookies:
 * the `sessionid` cookie and the `tt-target-idc` data-center hint. Pure so it
 * can be unit-tested without a live browser session.
 */
export function pickTikTokCredentialsFromCookies(
  cookies: Array<{ name: string; value?: string }>
): TikTokCapturedCredentials {
  const read = (name: string) =>
    cookies.find((cookie) => cookie.name === name)?.value?.trim() || null
  const sessionId = read('sessionid')
  const ttTargetIdc = read('tt-target-idc')
  return { sessionId, ttTargetIdc, loggedIn: Boolean(sessionId) }
}

export function hasTikTokSendCredentials(credentials: TikTokCapturedCredentials): boolean {
  return Boolean(credentials.sessionId && credentials.ttTargetIdc)
}

export function buildTikTokLiveChatUrl(username?: string | null): string | null {
  const normalized = username?.trim().replace(/^@+/, '')
  return normalized ? `https://www.tiktok.com/@${encodeURIComponent(normalized)}/live` : null
}

export function isTikTokLiveChatUrl(value?: string, username?: string | null): boolean {
  const expected = buildTikTokLiveChatUrl(username)
  if (!value || !expected) return false

  try {
    const currentUrl = new URL(value)
    const expectedUrl = new URL(expected)
    return currentUrl.hostname.toLowerCase() === expectedUrl.hostname.toLowerCase()
      && currentUrl.pathname.replace(/\/$/, '') === expectedUrl.pathname.replace(/\/$/, '')
  } catch {
    return false
  }
}

export function validateTikTokSenderMessage(
  value: string,
  maxLength = TIKTOK_SENDER_MAX_MESSAGE_LENGTH
): TikTokSenderMessageValidation {
  const text = value.replace(/\s+/g, ' ').trim()

  if (!text) {
    return { ok: false, text: '', error: 'Cannot send an empty TikTok chat message' }
  }

  if (text.length > maxLength) {
    return {
      ok: false,
      text,
      error: `TikTok chat messages are limited to ${maxLength} characters`
    }
  }

  return { ok: true, text }
}

export function getTikTokSenderCooldownMs(
  lastMessageSentAt: number,
  now = Date.now(),
  cooldownMs = TIKTOK_SENDER_SEND_COOLDOWN_MS
): number {
  if (!lastMessageSentAt) return 0
  return Math.max(0, lastMessageSentAt + cooldownMs - now)
}

export function describeTikTokSenderStatus(status: {
  isWindowOpen: boolean
  isOnTikTok: boolean
  isLoggedIn: boolean
  isChatReady: boolean
  hasSendCredentials?: boolean
}): string {
  if (!status.isWindowOpen) return 'Open the TikTok host session'
  if (!status.isOnTikTok) return 'Sender window is not on TikTok'
  if (!status.isLoggedIn) return 'Log in to TikTok in the sender window'
  if (status.isChatReady) return 'Public LIVE chat ready for relays'
  if (status.hasSendCredentials) return 'Signed in; open your public LIVE page to send relays'
  return 'TikTok is signed in; opening your public LIVE chat'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function detectTikTokSenderStateInPage(): TikTokSenderDomState {
  const isVisible = (element: any): boolean => {
    if (!(element instanceof HTMLElement)) return false
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length)
  }

  const findFirstVisible = (selectors: string[]): any | null => {
    for (const selector of selectors) {
      try {
        const match = Array.from(document.querySelectorAll(selector)).find((element: any) => (
          element instanceof HTMLElement && isVisible(element)
        ))
        if (match instanceof HTMLElement) return match
      } catch {}
    }

    return null
  }

  const isEditable = (element: any): boolean => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return !element.disabled && !element.readOnly
    }

    if (element instanceof HTMLElement) {
      return element.isContentEditable || element.getAttribute('contenteditable') === 'true'
    }

    return false
  }

  const findFirstEditable = (selectors: string[]): any | null => {
    for (const selector of selectors) {
      try {
        const match = Array.from(document.querySelectorAll(selector)).find((element: any) => (
          element instanceof HTMLElement && isVisible(element) && isEditable(element)
        ))
        if (match instanceof HTMLElement) return match
      } catch {}
    }

    return null
  }

  const currentUrl = window.location.href
  const isOnTikTok = window.location.hostname.endsWith('tiktok.com')
  const chatInput = findFirstEditable([
    'div[data-e2e="chat-input"] [contenteditable]',
    '[data-e2e="comment-input"] [contenteditable]',
    '[data-e2e="comment-input"] textarea',
    '[data-e2e="comment-input"] input',
    'textarea[placeholder="Type..."]',
    'input[placeholder="Type..."]',
    'textarea[placeholder*="chat"]',
    'textarea[placeholder*="comment"]',
    'textarea[aria-label*="chat"]',
    'textarea[aria-label*="comment"]',
    '.chat-input-container textarea',
    '[contenteditable][role="textbox"]',
    '[contenteditable]:not([contenteditable="false"])'
  ])

  chatInput?.scrollIntoView({ block: 'nearest', inline: 'nearest' })

  const loginPrompt = findFirstVisible([
    'button[data-e2e="top-login-button"]',
    'button[data-e2e="login-button"]',
    'a[href*="/login"]',
    'form input[name="username"]',
    'form input[name="email"]',
    'input[type="password"]'
  ])

  const accountUi = findFirstVisible([
    '[data-e2e="profile-icon"]',
    '[data-e2e="nav-profile"]',
    'a[href^="/@"]',
    'button[aria-label*="profile"]',
    'button[aria-label*="account"]'
  ])

  return {
    currentUrl,
    isOnTikTok,
    hasLoginPrompt: Boolean(loginPrompt),
    hasAccountUi: Boolean(accountUi),
    isChatReady: Boolean(chatInput)
  }
}

export async function sendMessageInTikTokPage(message: string): Promise<TikTokSendScriptResult> {
  const isVisible = (element: any): boolean => {
    if (!(element instanceof HTMLElement)) return false
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length)
  }

  const findFirstVisible = (selectors: string[]): any | null => {
    for (const selector of selectors) {
      try {
        const match = Array.from(document.querySelectorAll(selector)).find((element: any) => (
          element instanceof HTMLElement && isVisible(element)
        ))
        if (match instanceof HTMLElement) return match
      } catch {}
    }

    return null
  }

  const isEditable = (element: any): boolean => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return !element.disabled && !element.readOnly
    }

    if (element instanceof HTMLElement) {
      return element.isContentEditable || element.getAttribute('contenteditable') === 'true'
    }

    return false
  }

  const findFirstEditable = (selectors: string[]): any | null => {
    for (const selector of selectors) {
      try {
        const match = Array.from(document.querySelectorAll(selector)).find((element: any) => (
          element instanceof HTMLElement && isVisible(element) && isEditable(element)
        ))
        if (match instanceof HTMLElement) return match
      } catch {}
    }

    return null
  }

  const isEnabledButton = (element: any): boolean => {
    return element instanceof HTMLButtonElement
      ? !element.disabled
      : element.getAttribute('aria-disabled') !== 'true'
  }

  const setEditableText = (element: any, text: string): void => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      if (setter) {
        setter.call(element, text)
        return
      }
      element.value = text
      return
    }

    element.textContent = ''

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)

    document.execCommand('insertText', false, text)

    if (!element.textContent?.trim()) {
      element.textContent = text
    }
  }

  const getEditableText = (element: any): string => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return element.value
    }
    return element.textContent || ''
  }

  const dispatchEnter = (element: any): void => {
    // TikTok submits on keydown. Dispatching the legacy keypress and keyup
    // phases as separate synthetic events can make the public LIVE page render
    // several optimistic copies even though TikTok accepts only one message.
    element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }))
  }

  const findSendButton = (): any | null => {
    const directButton = findFirstVisible([
      'button[data-e2e="chat-send"]',
      'button[data-e2e="comment-post"]',
      '.chat-send-button',
      'button.send-btn',
      'button[type="submit"]'
    ])

    if (directButton && isEnabledButton(directButton)) {
      return directButton
    }

    const buttons = Array.from(document.querySelectorAll('button'))
    return buttons.find((button: any) => {
      if (!isVisible(button) || !isEnabledButton(button)) return false
      const label = [
        button.textContent,
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
        button.dataset.e2e
      ].join(' ')

      return /\b(send|post|comment|chat)\b/i.test(label)
    }) ?? null
  }

  const input = findFirstEditable([
    'div[data-e2e="chat-input"] [contenteditable]',
    '[data-e2e="comment-input"] [contenteditable]',
    '[data-e2e="comment-input"] textarea',
    '[data-e2e="comment-input"] input',
    'textarea[placeholder="Type..."]',
    'input[placeholder="Type..."]',
    'textarea[placeholder*="chat"]',
    'textarea[placeholder*="comment"]',
    'textarea[aria-label*="chat"]',
    'textarea[aria-label*="comment"]',
    '.chat-input-container textarea',
    '[contenteditable][role="textbox"]',
    '[contenteditable]:not([contenteditable="false"])'
  ])

  if (!input) {
    return { ok: false, reason: 'TikTok chat input was not found' }
  }

  input.focus()
  setEditableText(input, message)

  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: message, inputType: 'insertText' }))
  input.dispatchEvent(new Event('change', { bubbles: true }))

  await new Promise((resolve) => setTimeout(resolve, 150))

  const currentText = getEditableText(input).trim()
  if (!currentText) {
    return { ok: false, reason: 'TikTok chat input did not accept the message text' }
  }

  const sendButton = findSendButton()
  let method: string

  if (sendButton) {
    sendButton.click()
    method = 'button'
  } else {
    dispatchEnter(input)
    method = 'enter'
  }

  // A click/Enter dispatch only proves that we attempted a send. A stale
  // TikTok page can ignore it while leaving the composer untouched, which the
  // old sender incorrectly reported as success forever. TikTok clears the
  // composer after accepting a chat message, so wait for that acknowledgement.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    const remainingText = getEditableText(input).trim()
    if (!remainingText || remainingText !== currentText) {
      return { ok: true, method }
    }
  }

  return {
    ok: false,
    reason: 'TikTok chat did not confirm the message; reloading the sender page'
  }
}

export function isSafeNavigationUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

export function isTikTokOwnedWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && TIKTOK_OWNED_WEB_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function isTikTokBlockedAppProtocol(value: string): boolean {
  try {
    const url = new URL(value)
    return TIKTOK_BLOCKED_APP_PROTOCOLS.has(url.protocol.toLowerCase())
  } catch {
    return false
  }
}

function getBlockedNavigationMessage(value: string): string {
  if (isTikTokBlockedAppProtocol(value)) {
    return 'Blocked TikTok native-app link. Use the web LIVE Center login in this sender window.'
  }

  return 'Blocked unsafe TikTok sender navigation.'
}
