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
  // Advanced
  container?: 'mkv' | 'mp4' | 'flv' | 'mov'
  encoder?: 'auto' | 'libx264' | 'h264_nvenc' | 'h264_amf' | 'h264_qsv'
  crf?: number // 0-51, lower is better. Default depends on encoder.
  audioBitrate?: number // kbps, e.g. 192, 320
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
