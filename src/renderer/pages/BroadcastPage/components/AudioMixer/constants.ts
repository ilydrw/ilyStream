export type FxPreset = {
  type: string
  label: string
  params: Record<string, number>
}

export const FX_PRESETS: FxPreset[] = [
  { type: 'noise_gate', label: 'Noise Gate', params: { threshold: -48, reduction: 0.08 } },
  { type: 'compressor', label: 'Compressor', params: { threshold: -24, ratio: 4, attack: 0.006, release: 0.18 } },
  { type: 'eq', label: '3-Band EQ', params: { low: 0, mid: 0, high: 0 } },
  { type: 'limiter', label: 'Limiter', params: { threshold: -3 } },
  { type: 'radio', label: 'Radio Color', params: { drive: 12 } },
  { type: 'echo', label: 'Delay Send', params: { delay: 0.22, feedback: 0.28, mix: 0.22 } }
]

export const TRACK_COLOR_PRESETS = [
  { id: 'blue', label: 'Blue', value: '#64c7ff' },
  { id: 'violet', label: 'Violet', value: '#a56bff' },
  { id: 'green', label: 'Green', value: '#6ee787' },
  { id: 'amber', label: 'Amber', value: '#f7c948' },
  { id: 'pink', label: 'Pink', value: '#ff70b8' },
  { id: 'red', label: 'Red', value: '#ff6b6b' }
]

export const VOLUME_MARKS = [
  { db: 6, label: '+6' },
  { db: 0, label: '0' },
  { db: -6, label: '-6' },
  { db: -12, label: '-12' },
  { db: -24, label: '-24' },
  { db: -48, label: '-48' }
]

export const CHAT_HISTORY_LIMIT = 80
export const ALERT_HISTORY_LIMIT = 20
export const SSE_PING_INTERVAL_MS = 15000
export const DEFAULT_PORT = 8899
