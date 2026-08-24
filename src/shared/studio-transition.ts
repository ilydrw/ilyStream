export type StudioTransitionKind = 'cut' | 'fade' | 'stinger'

export interface TransitionTiming {
  durationMs: number
  cutAtMs: number
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function resolveTransitionTiming(
  type: StudioTransitionKind,
  transitionDuration: unknown,
  stingerDuration: unknown,
  stingerCutPoint: unknown
): TransitionTiming {
  if (type === 'cut') return { durationMs: 0, cutAtMs: 0 }
  if (type === 'fade') {
    const durationMs = Math.max(1, Math.round(finiteNumber(transitionDuration, 300)))
    return { durationMs, cutAtMs: durationMs }
  }

  const durationMs = Math.max(1, Math.round(finiteNumber(stingerDuration, 1000)))
  const cutAtMs = Math.min(
    durationMs,
    Math.max(0, Math.round(finiteNumber(stingerCutPoint, durationMs / 2)))
  )
  return { durationMs, cutAtMs }
}
