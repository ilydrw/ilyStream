export interface StreamConfig {
  outputId?: string
  outputName?: string
  rtmpUrl: string
  streamKey: string
  width: number
  height: number
  fps: number
  bitrateKbps: number
  inputFormat?: 'h264' | 'mjpeg'
  audioFormat?: 'f32le' | 'silent'
  audioSampleRate?: number
}

export interface RecordingConfig {
  width: number
  height: number
  fps: number
  bitrateKbps: number
  outputPath?: string
  inputFormat?: 'h264' | 'mjpeg'
  audioFormat?: 'f32le' | 'silent'
  audioSampleRate?: number
}

export interface VideoFramePayload {
  outputId?: string
  data: Uint8Array
  isKeyFrame?: boolean
  timestamp?: number
}

export interface AudioFramePayload {
  data: Uint8Array
  timestamp?: number
}
