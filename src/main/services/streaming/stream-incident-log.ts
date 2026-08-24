import type { StreamIncident, StreamIncidentKind } from '../streaming-types'

interface StreamIncidentInput {
  outputId: string
  outputName: string
  kind: StreamIncidentKind
  at?: number
  message: string
  retry?: number
}

/**
 * Bounded in-memory timeline for one app session. Inputs must already be
 * secret-free; callers at the streaming boundary own credential redaction.
 */
export class StreamIncidentLog {
  private entries: StreamIncident[] = []
  private sequence = 0

  constructor(private readonly capacity = 50) {}

  public add(input: StreamIncidentInput): StreamIncident {
    const at = input.at ?? Date.now()
    const incident: StreamIncident = {
      id: `${at}-${this.sequence++}`,
      outputId: input.outputId,
      outputName: input.outputName,
      kind: input.kind,
      at,
      message: input.message,
      ...(input.retry === undefined ? {} : { retry: input.retry })
    }

    this.entries.push(incident)
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity)
    }
    return incident
  }

  public list(limit = this.capacity): StreamIncident[] {
    const safeLimit = Math.max(0, Math.min(this.capacity, Math.floor(limit)))
    if (safeLimit === 0) return []
    return this.entries.slice(-safeLimit).map(incident => ({ ...incident }))
  }
}
