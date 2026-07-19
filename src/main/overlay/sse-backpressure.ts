import type { IncomingMessage, ServerResponse } from 'http'

/**
 * Ceiling on bytes Node may buffer for a single SSE client before we drop it.
 *
 * `response.write()` never fails just because the receiver stopped reading —
 * Node queues the data in process memory and keeps the TCP connection open.
 * A stalled overlay client (a sleeping Car Thing, a throttled OBS browser
 * source, a phone that left Wi-Fi without a FIN) would otherwise accumulate
 * the entire event stream for the rest of a multi-hour session. Dropping is
 * safe: EventSource auto-reconnects, and both SSE servers replay state on
 * connect (Last-Event-ID history / latestState + chatBacklog).
 */
export const SSE_MAX_BUFFERED_BYTES = 2 * 1024 * 1024

type SseWritable = ServerResponse<IncomingMessage>

/**
 * Write one SSE payload to a client, enforcing the buffer ceiling.
 * Returns false when the client is dead or was dropped for stalling —
 * callers should remove it from their client set.
 */
export function writeToSseClient(client: SseWritable, data: string, label: string): boolean {
  if (client.destroyed || client.writableEnded) return false

  try {
    client.write(data)
  } catch {
    destroySseClient(client)
    return false
  }

  const buffered = client.writableLength + (client.socket ? client.socket.writableLength : 0)
  if (buffered > SSE_MAX_BUFFERED_BYTES) {
    console.warn(
      `[sse] Dropping stalled client (${label}, ${Math.round(buffered / 1024)}KB buffered) — it can reconnect and replay.`
    )
    destroySseClient(client)
    return false
  }

  return true
}

function destroySseClient(client: SseWritable): void {
  // destroy() rather than end(): end() would still try to flush the very
  // backlog we are shedding. Destroying fires the request 'close' handlers,
  // so normal detach cleanup runs.
  try {
    client.destroy()
  } catch {
    /* already torn down */
  }
}
