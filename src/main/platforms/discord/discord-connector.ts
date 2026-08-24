import { Client } from 'discord-rpc'
import type { DiscordCallParticipant, DiscordCallState } from '../../../shared/discord-call'
import { createEmptyDiscordCallState } from '../../../shared/discord-call'
import { BaseConnector, ConnectorFatalError } from '../base-connector'
import type { AnyPlatformConfig, DiscordConfig } from '../types'

const DISCORD_SCOPES = ['rpc.voice.read', 'rpc']
const RECONCILE_INTERVAL_MS = 3_000
const REQUEST_TIMEOUT_MS = 10_000
const CONNECT_TIMEOUT_MS = 12_000
const TOKEN_EXCHANGE_TIMEOUT_MS = 15_000

const GLOBAL_EVENTS = [
  'VOICE_CHANNEL_SELECT',
  'VOICE_CONNECTION_STATUS',
  'VOICE_SETTINGS_UPDATE'
] as const

const CHANNEL_EVENTS = [
  'VOICE_STATE_CREATE',
  'VOICE_STATE_UPDATE',
  'VOICE_STATE_DELETE',
  'SPEAKING_START',
  'SPEAKING_STOP'
] as const

type DiscordUser = {
  id: string
  username?: string
  global_name?: string | null
  avatar?: string | null
}

type DiscordVoiceState = {
  user: DiscordUser
  nick?: string | null
  mute?: boolean
  voice_state?: {
    mute?: boolean
    self_mute?: boolean
    deaf?: boolean
    self_deaf?: boolean
  }
}

type DiscordVoiceChannel = {
  id: string
  name?: string
  guild_id?: string
  voice_states?: DiscordVoiceState[]
}

type DiscordSubscription = { unsubscribe: () => Promise<unknown> | unknown }

export type DiscordRpcClient = Client & {
  request<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>
  subscribe(event: string, args?: { channel_id?: string }): Promise<DiscordSubscription>
  user?: DiscordUser
}

export type DiscordRpcClientFactory = () => DiscordRpcClient

export class DiscordConnector extends BaseConnector {
  readonly platform = 'discord' as const

  private client: DiscordRpcClient | null = null
  private callState = createEmptyDiscordCallState()
  private accessToken: string | null = null
  private reconcileTimer: ReturnType<typeof setInterval> | null = null
  private refreshPromise: Promise<void> | null = null
  private refreshQueued = false
  private subscriptions = new Map<string, DiscordSubscription>()
  private subscribedChannelId: string | null = null
  private closingClient = false

  constructor(
    private readonly clientFactory: DiscordRpcClientFactory = () => (
      new Client({ transport: 'ipc' }) as DiscordRpcClient
    )
  ) {
    super()
  }

  validateConfig(config: AnyPlatformConfig): string | null {
    if (config.platform !== 'discord') return 'Invalid Discord configuration.'

    const discord = config as DiscordConfig
    if (!/^\d{15,24}$/.test(discord.clientId?.trim() || '')) {
      return 'Discord Client ID must be a valid application ID.'
    }
    if ((discord.clientSecret?.trim().length || 0) < 20) {
      return 'Discord Client Secret is required for voice-call authorization.'
    }

    try {
      const redirect = new URL(discord.redirectUrl?.trim() || '')
      const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
      if (redirect.protocol !== 'http:' || !allowedHosts.has(redirect.hostname)) {
        return 'Discord Redirect URL must use HTTP on localhost.'
      }
    } catch {
      return 'Discord Redirect URL must be a valid localhost URL.'
    }

    return null
  }

  getCallState(): DiscordCallState {
    return cloneCallState(this.callState)
  }

  protected async doConnect(config: AnyPlatformConfig): Promise<void> {
    const discord = config as DiscordConfig
    await this.destroyClient()
    this.applyCallState(createEmptyDiscordCallState('connecting', 'Connecting to the Discord desktop app…'))

    const client = this.clientFactory()
    this.client = client
    this.bindClient(client)

    try {
      await withTimeout(
        client.login({ clientId: discord.clientId!.trim() }),
        CONNECT_TIMEOUT_MS,
        'Timed out while connecting to the Discord desktop app.'
      )
      if (this.client !== client) throw new Error('Discord RPC connection was replaced.')

      this.applyCallState(createEmptyDiscordCallState('authorizing', 'Authorizing Discord voice access…'))
      await this.authenticate(client, discord)
      await this.subscribeGlobalEvents(client)
      await this.refreshCallState()
      this.startReconciliation()
    } catch (error) {
      await this.destroyClient()
      const message = explainAuthorizationError(errorMessage(error))
      this.applyCallState(createEmptyDiscordCallState('error', message))
      if (/invalid[_ ]client|invalid oauth|access denied|redirect|secret|rpc access/i.test(message)) {
        throw new ConnectorFatalError(message)
      }
      throw error
    }
  }

  protected async doDisconnect(): Promise<void> {
    this.stopReconciliation()
    await this.destroyClient()
    this.applyCallState(createEmptyDiscordCallState('disconnected', 'Discord voice integration is disconnected.'))
  }

  private bindClient(client: DiscordRpcClient): void {
    const handleDisconnect = (error?: unknown) => {
      if (this.client !== client || this.closingClient) return
      this.client = null
      this.stopReconciliation()
      void this.clearSubscriptions()
      client.removeAllListeners()
      void Promise.resolve(client.destroy()).catch(() => undefined)
      this.applyCallState(createEmptyDiscordCallState('disconnected', errorMessage(error || 'Discord desktop disconnected.')))
      this.onUnexpectedDisconnect(errorMessage(error || 'Discord desktop disconnected.'))
    }

    client.on('disconnected', handleDisconnect)
    client.on('error', handleDisconnect)
    client.on('VOICE_CHANNEL_SELECT', () => { void this.refreshCallState() })
    client.on('VOICE_CONNECTION_STATUS', () => { void this.refreshCallState() })
    client.on('VOICE_SETTINGS_UPDATE', () => { void this.refreshCallState() })
    client.on('VOICE_STATE_CREATE', () => { void this.refreshCallState() })
    client.on('VOICE_STATE_UPDATE', () => { void this.refreshCallState() })
    client.on('VOICE_STATE_DELETE', () => { void this.refreshCallState() })
    client.on('SPEAKING_START', (payload: { user_id?: string }) => {
      this.updateSpeaking(payload?.user_id, true)
    })
    client.on('SPEAKING_STOP', (payload: { user_id?: string }) => {
      this.updateSpeaking(payload?.user_id, false)
    })
  }

  private async authenticate(client: DiscordRpcClient, config: DiscordConfig): Promise<void> {
    let token = this.accessToken || config.accessToken?.trim() || null

    if (token) {
      try {
        await this.request(client, 'AUTHENTICATE', { access_token: token })
        this.accessToken = token
        return
      } catch (error) {
        if (!isStaleAccessTokenError(error)) throw error
        token = null
        this.accessToken = null
        delete config.accessToken
        this.emit('token-invalidated', { platform: 'discord' })
      }
    }

    const authorization = await this.request<{ code?: string }>(client, 'AUTHORIZE', {
      client_id: config.clientId!.trim(),
      scopes: DISCORD_SCOPES,
      prompt: 'consent'
    })
    if (!authorization?.code) throw new Error('Discord did not return an authorization code.')

    token = await exchangeAuthorizationCode({
      clientId: config.clientId!.trim(),
      clientSecret: config.clientSecret!.trim(),
      redirectUrl: config.redirectUrl!.trim(),
      code: authorization.code
    })
    await this.request(client, 'AUTHENTICATE', { access_token: token })
    this.accessToken = token
    this.emit('token-refresh', { platform: 'discord', accessToken: token })
  }

  private async subscribeGlobalEvents(client: DiscordRpcClient): Promise<void> {
    const results = await Promise.allSettled(
      GLOBAL_EVENTS.map((event) => this.subscribe(client, event))
    )
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length === GLOBAL_EVENTS.length) {
      throw new Error('Discord voice event subscriptions were rejected.')
    }
  }

  private async subscribeToChannel(client: DiscordRpcClient, channelId: string): Promise<void> {
    if (this.subscribedChannelId === channelId) return
    await this.unsubscribeChannelEvents()
    this.subscribedChannelId = channelId
    await Promise.allSettled(
      CHANNEL_EVENTS.map((event) => this.subscribe(client, event, channelId))
    )
  }

  private async subscribe(
    client: DiscordRpcClient,
    event: string,
    channelId?: string
  ): Promise<void> {
    const key = channelId ? `${event}:${channelId}` : event
    const existing = this.subscriptions.get(key)
    if (existing) return
    const subscription = await withTimeout(
      client.subscribe(event, channelId ? { channel_id: channelId } : {}),
      REQUEST_TIMEOUT_MS,
      `Discord subscription ${event} timed out.`
    )
    if (this.client !== client) {
      await Promise.resolve(subscription.unsubscribe()).catch(() => undefined)
      return
    }
    this.subscriptions.set(key, subscription)
  }

  private startReconciliation(): void {
    this.stopReconciliation()
    this.reconcileTimer = setInterval(() => { void this.refreshCallState() }, RECONCILE_INTERVAL_MS)
    this.reconcileTimer.unref?.()
  }

  private stopReconciliation(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer)
      this.reconcileTimer = null
    }
  }

  private refreshCallState(): Promise<void> {
    if (this.refreshPromise) {
      this.refreshQueued = true
      return this.refreshPromise
    }
    const pending = (async () => {
      do {
        this.refreshQueued = false
        await this.refreshCallStateInternal()
      } while (this.refreshQueued && this.client)
    })().finally(() => {
      if (this.refreshPromise === pending) this.refreshPromise = null
    })
    this.refreshPromise = pending
    return pending
  }

  private async refreshCallStateInternal(): Promise<void> {
    const client = this.client
    if (!client) return

    try {
      const channel = await this.request<DiscordVoiceChannel | null>(client, 'GET_SELECTED_VOICE_CHANNEL')
      if (this.client !== client) return

      if (!channel?.id) {
        await this.unsubscribeChannelEvents()
        this.applyCallState({
          ...createEmptyDiscordCallState('connected', 'Discord is connected. Join a voice channel to populate the widget.'),
          isConnected: true
        })
        return
      }

      await this.subscribeToChannel(client, channel.id)
      const speakingById = new Map(
        this.callState.participants.map((participant) => [participant.id, participant.isSpeaking])
      )
      const currentUserId = client.user?.id || null
      const participants = (channel.voice_states || [])
        .filter((state) => Boolean(state?.user?.id))
        .map((state) => convertParticipant(state, currentUserId, speakingById))

      this.applyCallState({
        connectionPhase: 'connected',
        connectionMessage: 'Discord voice is connected.',
        channelId: channel.id,
        channelName: channel.name?.trim() || 'Voice channel',
        guildId: channel.guild_id || null,
        isConnected: true,
        participants,
        updatedAt: new Date().toISOString()
      })
    } catch (error) {
      if (this.client !== client) return
      console.warn('[discord] Unable to reconcile call state:', errorMessage(error))
    }
  }

  private updateSpeaking(userId: string | undefined, isSpeaking: boolean): void {
    if (!userId) return
    let changed = false
    const participants = this.callState.participants.map((participant) => {
      if (participant.id !== userId || participant.isSpeaking === isSpeaking) return participant
      changed = true
      return { ...participant, isSpeaking }
    })
    if (!changed) return
    this.applyCallState({ ...this.callState, participants, updatedAt: new Date().toISOString() })
  }

  private applyCallState(next: DiscordCallState): void {
    if (sameCallState(this.callState, next)) return
    this.callState = cloneCallState(next)
    this.emit('call-state', this.getCallState())
  }

  private async unsubscribeChannelEvents(): Promise<void> {
    const channelEntries = [...this.subscriptions.entries()].filter(([key]) => key.includes(':'))
    for (const [key, subscription] of channelEntries) {
      this.subscriptions.delete(key)
      await Promise.resolve(subscription.unsubscribe()).catch(() => undefined)
    }
    this.subscribedChannelId = null
  }

  private async clearSubscriptions(): Promise<void> {
    const subscriptions = [...this.subscriptions.values()]
    this.subscriptions.clear()
    this.subscribedChannelId = null
    await Promise.allSettled(subscriptions.map((subscription) => Promise.resolve(subscription.unsubscribe())))
  }

  private async destroyClient(): Promise<void> {
    this.stopReconciliation()
    await this.clearSubscriptions()
    const client = this.client
    this.client = null
    if (!client) return

    this.closingClient = true
    try {
      client.removeAllListeners()
      await withTimeout(Promise.resolve(client.destroy()), 3_000, 'Timed out while closing Discord RPC.')
    } catch {
      // The Discord pipe may already be gone; teardown is best-effort.
    } finally {
      this.closingClient = false
    }
  }

  private request<T>(
    client: DiscordRpcClient,
    command: string,
    args?: Record<string, unknown>
  ): Promise<T> {
    return withTimeout(
      client.request<T>(command, args),
      REQUEST_TIMEOUT_MS,
      `Discord RPC request ${command} timed out.`
    )
  }
}

function convertParticipant(
  state: DiscordVoiceState,
  currentUserId: string | null,
  speakingById: Map<string, boolean>
): DiscordCallParticipant {
  const user = state.user
  const voice = state.voice_state || {}
  return {
    id: user.id,
    username: state.nick?.trim() || user.global_name?.trim() || user.username?.trim() || user.id,
    avatarUrl: buildDiscordAvatarUrl(user),
    isSpeaking: speakingById.get(user.id) || false,
    isMuted: Boolean(state.mute || voice.mute || voice.self_mute),
    isDeafened: Boolean(voice.deaf || voice.self_deaf),
    isCurrentUser: user.id === currentUserId
  }
}

function buildDiscordAvatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null
  const extension = user.avatar.startsWith('a_') ? 'gif' : 'webp'
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.${extension}?size=256`
}

function cloneCallState(state: DiscordCallState): DiscordCallState {
  return { ...state, participants: state.participants.map((participant) => ({ ...participant })) }
}

function sameCallState(left: DiscordCallState, right: DiscordCallState): boolean {
  return left.connectionPhase === right.connectionPhase &&
    left.connectionMessage === right.connectionMessage &&
    left.channelId === right.channelId &&
    left.channelName === right.channelName &&
    left.guildId === right.guildId &&
    left.isConnected === right.isConnected &&
    JSON.stringify(left.participants) === JSON.stringify(right.participants)
}

async function exchangeAuthorizationCode(input: {
  clientId: string
  clientSecret: string
  redirectUrl: string
  code: string
}): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT_MS)
  timer.unref?.()

  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUrl
      }),
      signal: controller.signal
    })
    const data = await readOAuthResponse(response)
    if (!response.ok) {
      throw new Error(formatOAuthFailure('Discord token exchange failed', response.status, data))
    }
    if (typeof data.access_token !== 'string' || data.access_token.length < 10) {
      throw new Error('Discord returned an invalid access token.')
    }
    return data.access_token
  } finally {
    clearTimeout(timer)
  }
}

type DiscordOAuthResponse = {
  access_token?: unknown
  error?: unknown
  error_description?: unknown
}

async function readOAuthResponse(response: Response): Promise<DiscordOAuthResponse> {
  try {
    return await response.json() as DiscordOAuthResponse
  } catch {
    return {}
  }
}

function formatOAuthFailure(prefix: string, status: number, data: DiscordOAuthResponse): string {
  const code = typeof data.error === 'string' ? data.error : ''
  const description = typeof data.error_description === 'string' ? data.error_description : ''
  const detail = [code, description].filter(Boolean).join(': ')
  return `${prefix} (${status})${detail ? `: ${detail}` : '.'}`
}

function explainAuthorizationError(message: string): string {
  if (/Missing ["']redirect_uri["']|cannot be used in the RPC OAuth2 Authorization flow/i.test(message)) {
    return 'Discord legacy RPC access is not enabled for this application. Use credentials from an application that Discord has approved for RPC access.'
  }
  return message
}

function isStaleAccessTokenError(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error
    ? Number((error as { code?: unknown }).code)
    : undefined
  return code === 4007 ||
    code === 4009 ||
    /application does not match the connection|invalid (access )?token|token revoked/i.test(errorMessage(error))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Discord RPC error')
  }
  return String(error ?? 'Discord RPC error')
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    timer.unref?.()
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) }
    )
  })
}
