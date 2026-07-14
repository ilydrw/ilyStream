import type { YouTubeConfig } from '../types'

/**
 * Turnkey YouTube go-live provisioning. Given a Google-account connection
 * (OAuth tokens from the "Connect with Google" flow), this finds or creates
 * everything YouTube needs before ingest can start, so the user never touches
 * a stream key or YouTube Studio:
 *
 *   1. If a broadcast is already ACTIVE, reuse its bound stream's key.
 *   2. Otherwise ensure a reusable "ilyStream" RTMP stream (holds the key).
 *   3. Reuse the user's next UPCOMING broadcast, or create one with
 *      auto-start/auto-stop so pushing ingest takes it live and stopping
 *      ingest ends it.
 *   4. Bind broadcast <-> stream and hand back the RTMP url + key.
 */

export interface YouTubeLiveDestination {
  rtmpUrl: string
  streamKey: string
  broadcastId: string
  watchUrl: string
  title: string
  /** True when YouTube will start/stop the broadcast with ingest automatically. */
  autoStart: boolean
  /** True when we created a fresh broadcast rather than reusing one. */
  createdBroadcast: boolean
}

const DEFAULT_RTMP_URL = 'rtmp://a.rtmp.youtube.com/live2'
const MANAGED_STREAM_TITLE = 'ilyStream'

async function createYouTubeClient(config: YouTubeConfig): Promise<any> {
  const accessToken = config.accessToken?.trim()
  const refreshToken = config.refreshToken?.trim()
  if (!accessToken && !refreshToken) {
    throw new Error(
      'YouTube is not signed in. Open the YouTube page and use "Connect with Google" first.'
    )
  }

  const { google } = await import('googleapis')
  const oauthClient = new google.auth.OAuth2(
    config.clientId?.trim() || undefined,
    config.clientSecret?.trim() || undefined
  )
  oauthClient.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined
  })
  return google.youtube({ version: 'v3', auth: oauthClient })
}

export async function ensureYouTubeLiveDestination(
  config: YouTubeConfig,
  options: { title?: string; categoryId?: string; privacyStatus?: 'public' | 'unlisted' | 'private' } = {}
): Promise<YouTubeLiveDestination> {
  const youtube = await createYouTubeClient(config)

  try {
    // 1. Someone already live (or mid countdown)? Ride the existing setup —
    // rebinding streams under an active broadcast would knock it over.
    const active = await listBroadcasts(youtube, 'active')
    if (active.length > 0) {
      const broadcast = active[0]
      const boundStreamId = broadcast.contentDetails?.boundStreamId
      if (boundStreamId) {
        const stream = await getStreamById(youtube, boundStreamId)
        const ingest = readIngestion(stream)
        if (ingest) {
          await applyBroadcastMetadata(youtube, broadcast, options)
          return toDestination(broadcast, ingest, { createdBroadcast: false })
        }
      }
    }

    // 2. Our reusable stream (the thing that owns the RTMP key).
    const stream = await ensureManagedStream(youtube)
    const ingest = readIngestion(stream)
    if (!ingest) {
      throw new Error('YouTube returned a live stream without ingestion info. Try again.')
    }

    // 3. A broadcast to attach it to.
    const upcoming = await listBroadcasts(youtube, 'upcoming')
    let broadcast = upcoming[0] ?? null
    let createdBroadcast = false

    if (!broadcast) {
      const now = new Date()
      const title =
        options.title?.trim() ||
        `Live on ilyStream — ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      const inserted = await youtube.liveBroadcasts.insert({
        part: ['snippet', 'status', 'contentDetails'],
        requestBody: {
          snippet: { title, scheduledStartTime: now.toISOString() },
          status: { privacyStatus: options.privacyStatus || 'public', selfDeclaredMadeForKids: false },
          contentDetails: {
            enableAutoStart: true,
            enableAutoStop: true
          }
        }
      })
      broadcast = inserted.data
      createdBroadcast = true
    }

    // 4. Bind our stream unless the broadcast already points at it.
    if (broadcast.contentDetails?.boundStreamId !== stream.id) {
      const bound = await youtube.liveBroadcasts.bind({
        id: broadcast.id,
        part: ['id', 'snippet', 'status', 'contentDetails'],
        streamId: stream.id
      })
      broadcast = bound.data
    }

    // 5. Stamp the user's title/category. Reused broadcasts keep their old
    // title otherwise; created ones still need the category (the broadcast
    // insert snippet doesn't accept categoryId — only videos.update does).
    await applyBroadcastMetadata(youtube, broadcast, options)

    return toDestination(broadcast, ingest, { createdBroadcast })
  } catch (error) {
    throw new Error(describeYouTubeLiveError(error))
  }
}

/**
 * Mid-stream (or pre-stream) title/category update: targets the active
 * broadcast first, then the next upcoming one.
 */
export async function updateYouTubeStreamInfo(
  config: YouTubeConfig,
  input: { title?: string; categoryId?: string }
): Promise<{ broadcastId: string }> {
  const youtube = await createYouTubeClient(config)
  try {
    const broadcast = (await listBroadcasts(youtube, 'active'))[0] ??
      (await listBroadcasts(youtube, 'upcoming'))[0]
    if (!broadcast) {
      throw new Error('No active or scheduled YouTube broadcast to update.')
    }
    const changed = await applyBroadcastMetadata(youtube, broadcast, input)
    if (!changed) {
      throw new Error('Nothing to update — set a title or category first.')
    }
    return { broadcastId: broadcast.id || '' }
  } catch (error) {
    throw new Error(describeYouTubeLiveError(error))
  }
}

/**
 * Sets title/categoryId on the broadcast's underlying video. videos.update
 * replaces the whole snippet, so the current one is fetched and merged first —
 * otherwise the description/tags would be wiped. Mutates `broadcast.snippet`
 * to keep the returned destination title accurate. Returns false when there
 * was nothing to change.
 */
async function applyBroadcastMetadata(
  youtube: any,
  broadcast: any,
  options: { title?: string; categoryId?: string }
): Promise<boolean> {
  const title = options.title?.trim()
  const categoryId = options.categoryId?.trim()
  if (!title && !categoryId) return false
  if (!broadcast?.id) return false

  const videoResponse = await youtube.videos.list({
    part: ['snippet'],
    id: [broadcast.id]
  })
  const video = videoResponse.data.items?.[0]
  if (!video?.snippet) return false

  const snippet = video.snippet
  const nextTitle = title || snippet.title
  const nextCategoryId = categoryId || snippet.categoryId
  if (snippet.title === nextTitle && snippet.categoryId === nextCategoryId) {
    if (broadcast.snippet) broadcast.snippet.title = nextTitle
    return true
  }

  await youtube.videos.update({
    part: ['snippet'],
    requestBody: {
      id: broadcast.id,
      snippet: { ...snippet, title: nextTitle, categoryId: nextCategoryId }
    }
  })
  if (broadcast.snippet) broadcast.snippet.title = nextTitle
  return true
}

interface IngestionInfo {
  rtmpUrl: string
  streamKey: string
}

function toDestination(
  broadcast: any,
  ingest: IngestionInfo,
  extra: { createdBroadcast: boolean }
): YouTubeLiveDestination {
  return {
    rtmpUrl: ingest.rtmpUrl,
    streamKey: ingest.streamKey,
    broadcastId: broadcast.id || '',
    watchUrl: broadcast.id ? `https://youtube.com/watch?v=${broadcast.id}` : '',
    title: broadcast.snippet?.title || '',
    autoStart: broadcast.contentDetails?.enableAutoStart === true,
    createdBroadcast: extra.createdBroadcast
  }
}

async function listBroadcasts(youtube: any, broadcastStatus: 'active' | 'upcoming'): Promise<any[]> {
  const response = await youtube.liveBroadcasts.list({
    part: ['id', 'snippet', 'status', 'contentDetails'],
    broadcastType: 'all',
    mine: true,
    maxResults: 5,
    broadcastStatus
  })
  return response.data.items || []
}

async function getStreamById(youtube: any, streamId: string): Promise<any | null> {
  const response = await youtube.liveStreams.list({
    part: ['id', 'snippet', 'cdn', 'status'],
    id: [streamId]
  })
  return response.data.items?.[0] ?? null
}

async function ensureManagedStream(youtube: any): Promise<any> {
  const response = await youtube.liveStreams.list({
    part: ['id', 'snippet', 'cdn', 'status'],
    mine: true,
    maxResults: 50
  })
  const streams: any[] = response.data.items || []

  const usable = (stream: any) =>
    stream?.cdn?.ingestionType === 'rtmp' && stream?.cdn?.ingestionInfo?.streamName

  // Prefer the stream we created on a previous run, else any reusable RTMP
  // stream the account already has (e.g. the YouTube Studio default key).
  const managed = streams.find((s) => s.snippet?.title === MANAGED_STREAM_TITLE && usable(s))
  if (managed) return managed
  const existing = streams.find(usable)
  if (existing) return existing

  const inserted = await youtube.liveStreams.insert({
    part: ['snippet', 'cdn', 'contentDetails'],
    requestBody: {
      snippet: { title: MANAGED_STREAM_TITLE },
      cdn: { ingestionType: 'rtmp', frameRate: 'variable', resolution: 'variable' },
      contentDetails: { isReusable: true }
    }
  })
  return inserted.data
}

function readIngestion(stream: any): IngestionInfo | null {
  const info = stream?.cdn?.ingestionInfo
  if (!info?.streamName) return null
  return {
    rtmpUrl: info.ingestionAddress || DEFAULT_RTMP_URL,
    streamKey: info.streamName
  }
}

function describeYouTubeLiveError(error: unknown): string {
  const err = error as any
  const reason = String(
    err?.response?.data?.error?.errors?.[0]?.reason || err?.errors?.[0]?.reason || ''
  ).toLowerCase()
  const message = String(err?.response?.data?.error?.message || err?.message || err || '')

  if (reason.includes('livestreamingnotenabled') || message.includes('live streaming is not enabled')) {
    return 'Live streaming is not enabled on this YouTube channel. Enable it at studio.youtube.com (first-time setup needs phone verification and up to 24h).'
  }
  if (reason.includes('livepermissionblocked')) {
    return 'This YouTube channel is currently blocked from live streaming. Check your channel status in YouTube Studio.'
  }
  if (reason.includes('quota') || (message.toLowerCase().includes('quota') && message.toLowerCase().includes('exceed'))) {
    return 'YouTube Data API quota is exhausted for this Google Cloud project. Wait for the daily reset, or paste a stream key manually on the YouTube page.'
  }
  if (reason.includes('invalid_grant') || message.includes('invalid_grant')) {
    return 'YouTube sign-in has expired. Reconnect with Google on the YouTube page.'
  }
  return `YouTube go-live setup failed: ${message}`
}
