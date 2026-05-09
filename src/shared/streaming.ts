export const STREAMING_VIDEO_ENCODERS = ['h264_nvenc', 'h264_amf', 'h264_qsv', 'libx264'] as const
export const STREAMING_ENCODER_PREFERENCES = ['auto', ...STREAMING_VIDEO_ENCODERS] as const

export type StreamingVideoEncoder = (typeof STREAMING_VIDEO_ENCODERS)[number]
export type StreamingEncoderPreference = (typeof STREAMING_ENCODER_PREFERENCES)[number]
export type StreamingInputFormat = 'h264' | 'mjpeg' | 'raw'

export interface StreamingEncoderProbe {
  encoder: StreamingVideoEncoder
  available: boolean
  supported: boolean
  error?: string
}

export interface StreamingEncoderDiagnostics {
  gpuNames: string[]
  ffmpegPath: string
  availableEncoders: StreamingVideoEncoder[]
  preference: StreamingEncoderPreference
  selectedEncoder: StreamingVideoEncoder
  selectedReason: string
  probes: StreamingEncoderProbe[]
}

export function resolveStreamingEncoderPreference(value: unknown): StreamingEncoderPreference {
  return STREAMING_ENCODER_PREFERENCES.includes(value as StreamingEncoderPreference)
    ? value as StreamingEncoderPreference
    : 'auto'
}

export function isHardwareStreamingEncoder(encoder: StreamingVideoEncoder): boolean {
  return encoder !== 'libx264'
}

export function getStreamingEncoderLabel(encoder: StreamingEncoderPreference | StreamingVideoEncoder): string {
  switch (encoder) {
    case 'auto':
      return 'Auto'
    case 'h264_nvenc':
      return 'NVIDIA NVENC'
    case 'h264_amf':
      return 'AMD AMF'
    case 'h264_qsv':
      return 'Intel Quick Sync'
    case 'libx264':
      return 'Software x264'
    default:
      return String(encoder)
  }
}
