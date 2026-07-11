export function summarizePayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload ?? 'No payload')
  const data = payload as any
  if (data.type) return `type=${data.type}`
  if (data.payload?.type) return `payload.type=${data.payload.type}`
  if (Array.isArray(data.payload)) return `${data.payload.length} item(s)`
  if (Array.isArray(data)) return `${data.length} item(s)`
  return Object.keys(data).slice(0, 4).join(', ') || 'Object payload'
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 180)
}

export function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function waitForReplay(waitMs: number, shouldCancel: () => boolean): Promise<void> {
  const safeWaitMs = Math.min(60000, Math.max(0, waitMs))
  if (safeWaitMs === 0 || shouldCancel()) return Promise.resolve()

  return new Promise((resolve) => {
    const startedAt = Date.now()
    const tick = () => {
      if (shouldCancel() || Date.now() - startedAt >= safeWaitMs) {
        resolve()
        return
      }
      window.setTimeout(tick, Math.min(250, safeWaitMs - (Date.now() - startedAt)))
    }
    tick()
  })
}
