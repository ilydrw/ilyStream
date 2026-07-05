import { BrowserWindow, shell } from 'electron'

declare const document: any
declare const window: any
declare const Event: any
declare const HTMLButtonElement: any
declare const HTMLElement: any
declare const HTMLInputElement: any
declare const HTMLTextAreaElement: any
declare const InputEvent: any
declare const KeyboardEvent: any

const TIKTOK_CHAT_URL = 'https://livecenter.tiktok.com/producer'
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
const TIKTOK_AUTH_COOKIE_NAMES = new Set(['sessionid', 'sessionid_ss', 'sid_tt', 'uid_tt'])

export const TIKTOK_SENDER_MAX_MESSAGE_LENGTH = 150
export const TIKTOK_SENDER_SEND_COOLDOWN_MS = 1500

export interface TikTokSenderStatus {
  isWindowOpen: boolean
  isLoggedIn: boolean
  isChatReady: boolean
  isOnTikTok: boolean
  currentUrl?: string
  lastMessageSentAt?: number
  nextSendAvailableAt?: number
  lastError?: string
  statusMessage: string
  maxMessageLength: number
  sendCooldownMs: number
}

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
  private currentUrl: string | undefined
  private lastError: string | undefined
  private lastMessageSentAt = 0
  private sendQueue: Promise<void> = Promise.resolve()

  getStatus(): TikTokSenderStatus {
    const now = Date.now()
    const nextSendAvailableAt = this.lastMessageSentAt
      ? this.lastMessageSentAt + TIKTOK_SENDER_SEND_COOLDOWN_MS
      : undefined

    return {
      isWindowOpen: !!this.window,
      isLoggedIn: this.isLoggedIn,
      isChatReady: this.isChatReady,
      isOnTikTok: this.isOnTikTok,
      currentUrl: this.currentUrl,
      lastMessageSentAt: this.lastMessageSentAt || undefined,
      nextSendAvailableAt: nextSendAvailableAt && nextSendAvailableAt > now ? nextSendAvailableAt : undefined,
      lastError: this.lastError,
      statusMessage: describeTikTokSenderStatus({
        isWindowOpen: !!this.window,
        isOnTikTok: this.isOnTikTok,
        isLoggedIn: this.isLoggedIn,
        isChatReady: this.isChatReady
      }),
      maxMessageLength: TIKTOK_SENDER_MAX_MESSAGE_LENGTH,
      sendCooldownMs: TIKTOK_SENDER_SEND_COOLDOWN_MS
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
      title: 'TikTok Host Chat Sender',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:tiktok-chat-sender',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
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

    this.window.on('closed', () => {
      this.window = null
      this.stopDetectionLoop()
      this.isLoggedIn = false
      this.isOnTikTok = false
      this.isChatReady = false
      this.currentUrl = undefined
    })

    try {
      await this.window.loadURL(TIKTOK_CHAT_URL)
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
    if (!this.window || !this.isChatReady) {
      this.lastError = this.getUnavailableReason()
      console.warn('[tiktok-sender] Attempted to send message but sender is not ready:', this.lastError)
      return false
    }

    try {
      const cooldownMs = getTikTokSenderCooldownMs(this.lastMessageSentAt)
      if (cooldownMs > 0) {
        await delay(cooldownMs)
      }

      const result = (await this.window.webContents.executeJavaScript(
        `(${sendMessageInTikTokPage.toString()})(${JSON.stringify(text)})`
      )) as TikTokSendScriptResult

      if (result?.ok) {
        this.lastMessageSentAt = Date.now()
        this.lastError = undefined
        return true
      }

      this.lastError = result?.reason || 'TikTok did not accept the chat message'
      console.warn('[tiktok-sender] Message send failed:', this.lastError)
      return false
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      console.error('[tiktok-sender] Failed to inject message:', err)
      return false
    }
  }

  private startDetectionLoop(): void {
    this.stopDetectionLoop()
    void this.refreshSenderState()
    this.detectionTimer = setInterval(() => {
      void this.refreshSenderState()
    }, DETECTION_INTERVAL_MS)
  }

  private stopDetectionLoop(): void {
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer)
      this.detectionTimer = null
    }
  }

  private async refreshSenderState(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      this.window = null
      this.isLoggedIn = false
      this.isOnTikTok = false
      this.isChatReady = false
      this.currentUrl = undefined
      this.stopDetectionLoop()
      return
    }

    try {
      const previousUnavailableReason = this.getUnavailableReason()
      const [domState, hasSessionCookie] = await Promise.all([
        this.window.webContents.executeJavaScript(
          `(${detectTikTokSenderStateInPage.toString()})()`
        ) as Promise<TikTokSenderDomState>,
        this.hasTikTokAuthCookie()
      ])

      this.currentUrl = domState.currentUrl
      this.isOnTikTok = domState.isOnTikTok
      this.isLoggedIn = this.isOnTikTok && !domState.hasLoginPrompt && (domState.hasAccountUi || hasSessionCookie)
      this.isChatReady = this.isLoggedIn && domState.isChatReady

      if (this.isChatReady && this.lastError === previousUnavailableReason) {
        this.lastError = undefined
      }
    } catch (error) {
      this.isChatReady = false
      this.lastError = error instanceof Error ? error.message : String(error)
    }
  }

  private async hasTikTokAuthCookie(): Promise<boolean> {
    if (!this.window || this.window.isDestroyed()) return false

    try {
      const cookies = await this.window.webContents.session.cookies.get({ url: 'https://www.tiktok.com' })
      return cookies.some((cookie) => TIKTOK_AUTH_COOKIE_NAMES.has(cookie.name))
    } catch {
      return false
    }
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
      const cookies = await this.window.webContents.session.cookies.get({ url: 'https://www.tiktok.com' })
      return pickTikTokCredentialsFromCookies(cookies)
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
      isChatReady: this.isChatReady
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
}): string {
  if (!status.isWindowOpen) return 'Open the TikTok host chat sender'
  if (!status.isOnTikTok) return 'Sender window is not on TikTok'
  if (!status.isLoggedIn) return 'Log in to TikTok in the sender window'
  if (!status.isChatReady) return 'Open your LIVE dashboard or chat pop-out'
  return 'Ready to send as host'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  const currentUrl = window.location.href
  const isOnTikTok = window.location.hostname.endsWith('tiktok.com')
  const chatInput = findFirstVisible([
    'div[data-e2e="chat-input"]',
    'textarea[placeholder*="chat"]',
    'textarea[placeholder*="comment"]',
    'textarea[aria-label*="chat"]',
    'textarea[aria-label*="comment"]',
    '.chat-input-container textarea',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]'
  ])

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
    isChatReady: Boolean(chatInput && isEditable(chatInput))
  }
}

async function sendMessageInTikTokPage(message: string): Promise<TikTokSendScriptResult> {
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
    for (const type of ['keydown', 'keypress', 'keyup']) {
      element.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }))
    }
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

  const input = findFirstVisible([
    'div[data-e2e="chat-input"]',
    'textarea[placeholder*="chat"]',
    'textarea[placeholder*="comment"]',
    'textarea[aria-label*="chat"]',
    'textarea[aria-label*="comment"]',
    '.chat-input-container textarea',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]'
  ])

  if (!input || !isEditable(input)) {
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

  if (sendButton) {
    sendButton.click()
    return { ok: true, method: 'button' }
  }

  dispatchEnter(input)
  return { ok: true, method: 'enter' }
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
