/**
 * Adaptive bitrate policy. Converts the per-heartbeat "this output is
 * actively dropping frames" signal into encoder bitrate adjustments, so a
 * congested network or overloaded encoder degrades to softer video instead
 * of stuttering.
 *
 * Pure state machine — no timers, no IO. The streaming service feeds it one
 * sample per encoder per heartbeat and applies whatever adjustments come
 * back (renderer-side WebCodecs encoders reconfigure live, no reconnect).
 *
 * Policy per encoder:
 *  - `degradeTicks` consecutive unhealthy heartbeats → step bitrate down by
 *    `stepDown`, never below `minScale` of the configured bitrate.
 *  - `recoverTicks` consecutive healthy heartbeats → step back up by
 *    `stepUp`, capped at the configured bitrate.
 *  - `cooldownMs` between any two steps, so one bad patch produces a
 *    measured ramp instead of a cliff.
 */

export interface AdaptiveBitrateOptions {
  minScale?: number
  stepDown?: number
  stepUp?: number
  degradeTicks?: number
  recoverTicks?: number
  cooldownMs?: number
}

export interface EncoderHealthSample {
  /** Encoder identity — the layout prefix of the output ids it feeds. */
  encoderId: string
  /** The user-configured bitrate this encoder started at. */
  baseBitrateKbps: number
  /** True when any output fed by this encoder is dropping or reconnecting. */
  degraded: boolean
}

export interface BitrateAdjustment {
  encoderId: string
  bitrateKbps: number
  scale: number
  direction: 'down' | 'up'
}

interface EncoderState {
  scale: number
  degradedStreak: number
  cleanStreak: number
  lastStepAt: number
}

export class AdaptiveBitrateController {
  private readonly minScale: number
  private readonly stepDown: number
  private readonly stepUp: number
  private readonly degradeTicks: number
  private readonly recoverTicks: number
  private readonly cooldownMs: number

  private readonly encoders = new Map<string, EncoderState>()

  constructor(options: AdaptiveBitrateOptions = {}) {
    this.minScale = options.minScale ?? 0.5
    this.stepDown = options.stepDown ?? 0.8
    this.stepUp = options.stepUp ?? 1.1
    this.degradeTicks = options.degradeTicks ?? 3
    this.recoverTicks = options.recoverTicks ?? 30
    this.cooldownMs = options.cooldownMs ?? 10_000
  }

  /**
   * Feed one heartbeat's samples; returns the adjustments to apply now.
   * Encoders absent from `samples` are forgotten (stream stopped) so the
   * next session starts back at full scale.
   */
  observe(samples: EncoderHealthSample[], nowMs: number): BitrateAdjustment[] {
    const activeIds = new Set(samples.map((sample) => sample.encoderId))
    for (const id of this.encoders.keys()) {
      if (!activeIds.has(id)) this.encoders.delete(id)
    }

    const adjustments: BitrateAdjustment[] = []

    for (const sample of samples) {
      let state = this.encoders.get(sample.encoderId)
      if (!state) {
        // lastStepAt at -Infinity so the FIRST step is never cooldown-gated —
        // heartbeat clocks start near 0 and a 0 default would silently eat
        // the first cooldown window.
        state = { scale: 1, degradedStreak: 0, cleanStreak: 0, lastStepAt: Number.NEGATIVE_INFINITY }
        this.encoders.set(sample.encoderId, state)
      }

      if (sample.degraded) {
        state.cleanStreak = 0
        state.degradedStreak += 1

        const canStep = nowMs - state.lastStepAt >= this.cooldownMs
        if (state.degradedStreak >= this.degradeTicks && canStep && state.scale > this.minScale) {
          state.scale = Math.max(this.minScale, roundScale(state.scale * this.stepDown))
          state.lastStepAt = nowMs
          state.degradedStreak = 0
          adjustments.push(this.toAdjustment(sample, state, 'down'))
        }
      } else {
        state.degradedStreak = 0
        state.cleanStreak += 1

        const canStep = nowMs - state.lastStepAt >= this.cooldownMs
        if (state.scale < 1 && state.cleanStreak >= this.recoverTicks && canStep) {
          state.scale = Math.min(1, roundScale(state.scale * this.stepUp))
          state.lastStepAt = nowMs
          state.cleanStreak = 0
          adjustments.push(this.toAdjustment(sample, state, 'up'))
        }
      }
    }

    return adjustments
  }

  /** Current scale for an encoder (1 when untouched/unknown). */
  getScale(encoderId: string): number {
    return this.encoders.get(encoderId)?.scale ?? 1
  }

  private toAdjustment(
    sample: EncoderHealthSample,
    state: EncoderState,
    direction: 'down' | 'up'
  ): BitrateAdjustment {
    return {
      encoderId: sample.encoderId,
      bitrateKbps: Math.max(1, Math.round(sample.baseBitrateKbps * state.scale)),
      scale: state.scale,
      direction
    }
  }
}

/** Kill float creep and snap near-full scales back to exactly 1. */
function roundScale(scale: number): number {
  const rounded = Math.round(scale * 100) / 100
  return rounded >= 0.97 ? 1 : rounded
}
