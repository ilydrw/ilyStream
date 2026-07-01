export type RecordingVideoCodec = 'h264' | 'h265'
export type RecordingVideoEncoder =
  | 'auto'
  | 'libx264'
  | 'h264_nvenc'
  | 'h264_amf'
  | 'h264_qsv'
  | 'libx265'
  | 'hevc_nvenc'
  | 'hevc_amf'
  | 'hevc_qsv'

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
  codec?: RecordingVideoCodec
  encoder?: RecordingVideoEncoder
  crf?: number // 0-51, lower is better. Default depends on encoder.
  audioBitrate?: number // kbps, e.g. 192, 320
}


export interface VideoFramePayload {
  outputId?: string
  data: Uint8Array
  isKeyFrame?: boolean
  timestamp?: number
  width?: number
  height?: number
  stride?: number
  format?: 'h264' | 'mjpeg' | 'bgra'
}

export interface AudioFramePayload {
  data: Uint8Array
  timestamp?: number
}
