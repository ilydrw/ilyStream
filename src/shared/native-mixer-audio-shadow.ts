export interface NativeMixerAudioShadowConfig {
  sourceIds: string[]
}

export interface NativeMixerAudioShadowFrame {
  sourceId: string
  data: Uint8Array
  sampleRate: 48_000
  channels: 2
}

export interface NativeMixerAudioReferenceFrame {
  data: Uint8Array
  sampleRate: 48_000
  channels: 2
}

export const NATIVE_MIXER_BLOCK_FRAMES = 1024
export const NATIVE_MIXER_BLOCK_BYTES = NATIVE_MIXER_BLOCK_FRAMES * 2 * Float32Array.BYTES_PER_ELEMENT
const ID_PATTERN = /^[\x20-\x7e]{1,128}$/

export function parseNativeMixerAudioShadowConfig(value: unknown): NativeMixerAudioShadowConfig | null {
  if (!value || typeof value !== 'object') return null
  const sourceIds = (value as Record<string, unknown>).sourceIds
  if (!Array.isArray(sourceIds) || sourceIds.length === 0 || sourceIds.length > 64) return null
  const seen = new Set<string>()
  for (const id of sourceIds) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || seen.has(id)) return null
    seen.add(id)
  }
  return { sourceIds: [...sourceIds] }
}

function parseFrameData(value: unknown): Uint8Array | null {
  if (!(value instanceof Uint8Array) || value.byteLength !== NATIVE_MIXER_BLOCK_BYTES) return null
  const samples = new DataView(value.buffer, value.byteOffset, value.byteLength)
  for (let offset = 0; offset < value.byteLength; offset += Float32Array.BYTES_PER_ELEMENT) {
    if (!Number.isFinite(samples.getFloat32(offset, true))) return null
  }
  return value
}

export function parseNativeMixerAudioShadowFrame(value: unknown): NativeMixerAudioShadowFrame | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const data = parseFrameData(input.data)
  if (
    typeof input.sourceId !== 'string' || !ID_PATTERN.test(input.sourceId) || !data ||
    input.sampleRate !== 48_000 || input.channels !== 2
  ) return null
  return { sourceId: input.sourceId, data, sampleRate: 48_000, channels: 2 }
}

export function parseNativeMixerAudioReferenceFrame(value: unknown): NativeMixerAudioReferenceFrame | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const data = parseFrameData(input.data)
  if (!data || input.sampleRate !== 48_000 || input.channels !== 2) return null
  return { data, sampleRate: 48_000, channels: 2 }
}
