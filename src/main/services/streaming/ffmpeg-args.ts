import type { StreamConfig, RecordingConfig } from '../streaming-types'

export class FFmpegArgsBuilder {
  constructor(private encoderResolver: any) {}

  public buildAudioInput(audioFormat: 'f32le' | 'silent' = 'silent', sampleRate: number = 48000): string[] {
    if (audioFormat === 'f32le') {
      return [
        '-thread_queue_size', '2048',
        '-use_wallclock_as_timestamps', '1',
        '-f', 'f32le',
        '-ar', String(sampleRate),
        '-ac', '2',
        '-i', 'pipe:3'
      ]
    }

    return [
      '-f', 'lavfi',
      '-i', `anullsrc=r=${sampleRate}:cl=stereo`
    ]
  }

  public buildInputMap(audioFormat: 'f32le' | 'silent' = 'silent'): string[] {
    return [
      '-map', '0:v:0',
      '-map', '1:a:0'
    ]
  }

  public buildImagePipeInput(width: number, height: number, fps: number, audioFormat: 'f32le' | 'silent' = 'silent', sampleRate: number = 48000): string[] {
    return [
      '-hide_banner',
      '-loglevel', 'warning',
      '-fflags', 'nobuffer+genpts',
      '-flags', 'low_delay',
      '-thread_queue_size', '1024',
      '-use_wallclock_as_timestamps', '1',
      '-f', 'image2pipe',
      '-s', `${width}x${height}`,
      '-framerate', String(fps),
      '-c:v', 'mjpeg',
      '-i', 'pipe:0',
      ...this.buildAudioInput(audioFormat, sampleRate)
    ]
  }

  public buildH264PipeInput(width: number, height: number, fps: number, audioFormat: 'f32le' | 'silent' = 'silent', sampleRate: number = 48000): string[] {
    return [
      '-hide_banner',
      '-loglevel', 'warning',
      '-fflags', 'nobuffer+genpts',
      '-flags', 'low_delay',
      '-thread_queue_size', '2048',
      '-use_wallclock_as_timestamps', '1',
      '-f', 'h264',
      '-framerate', String(fps),
      '-i', 'pipe:0',
      ...this.buildAudioInput(audioFormat, sampleRate)
    ]
  }

  public async buildStreamArgs(config: StreamConfig, fullUrl: string, bestEncoder: string): Promise<string[]> {
    const inputFormat = config.inputFormat || 'mjpeg'
    const audioFormat = config.audioFormat || 'silent'
    const copyEncodedVideo = inputFormat === 'h264'

    return [
      ...(inputFormat === 'h264'
        ? this.buildH264PipeInput(config.width, config.height, config.fps, audioFormat, config.audioSampleRate)
        : this.buildImagePipeInput(config.width, config.height, config.fps, audioFormat, config.audioSampleRate)),
      ...this.encoderResolver.getEncoderArgs(copyEncodedVideo ? 'copy' : bestEncoder, { ...config, inputFormat }, 'stream'),
      ...(copyEncodedVideo ? [] : ['-r', String(config.fps)]),
      '-fps_mode', 'cfr',
      ...this.buildInputMap(audioFormat),
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '48000',
      '-ac', '2',
      '-af', 'aresample=async=1:min_comp=0.001:min_hard_comp=0.050:first_pts=0',
      '-avoid_negative_ts', 'make_zero',
      '-max_interleave_delta', '50000',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '1',
      '-flvflags', 'no_duration_filesize+add_keyframe_index',
      '-f', 'flv',
      '-probesize', '5M',
      '-analyzeduration', '2000000',
      '-tcp_nodelay', '1',
      '-rtmp_buffer', '0',
      '-rtmp_live', 'live',
      '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)',
      '-rw_timeout', '5000000',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-bufsize', `${config.bitrateKbps}k`,
      fullUrl
    ]
  }

  public async buildRecordArgs(config: RecordingConfig, bestEncoder: string): Promise<string[]> {
    const inputFormat = config.inputFormat || 'mjpeg'
    const encoder = inputFormat === 'h264' ? 'copy' : bestEncoder
    const audioFormat = config.audioFormat || 'silent'

    return [
      ...(inputFormat === 'h264'
        ? this.buildH264PipeInput(config.width, config.height, config.fps, audioFormat, config.audioSampleRate)
        : this.buildImagePipeInput(config.width, config.height, config.fps, audioFormat, config.audioSampleRate)),
      ...this.encoderResolver.getEncoderArgs(encoder, { ...config, inputFormat }, 'record'),
      ...this.buildInputMap(audioFormat),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      '-movflags', '+faststart',
      '-shortest',
      '-y', config.outputPath
    ]
  }
}
