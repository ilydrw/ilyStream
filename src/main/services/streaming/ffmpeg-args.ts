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
    const isVirtualCam = fullUrl.startsWith('video=') || fullUrl.startsWith('/dev/video')
    const format = isVirtualCam
      ? (process.platform === 'win32' ? 'dshow' : 'v4l2')
      : 'flv'

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
      // Allow up to 500 ms of AV drift before async-resampling kicks in.
      // The previous 50 ms threshold caused audible pitch chirps every time
      // the renderer hitched, because aresample stretches/compresses to "catch up".
      '-af', 'aresample=async=1:min_hard_comp=0.500:first_pts=0',
      '-avoid_negative_ts', 'make_zero',
      '-max_interleave_delta', '0',
      ...(isVirtualCam ? [] : ['-flvflags', 'no_duration_filesize+add_keyframe_index']),
      '-f', format,
      '-probesize', '5M',
      '-analyzeduration', '2000000',
      ...(isVirtualCam ? [] : [
        '-tcp_nodelay', '1',
        // 2-second send buffer absorbs Wi-Fi reassociation / brief upload jitter.
        // Previously `0` meant any 30 ms hiccup stalled the encoder.
        '-rtmp_buffer', '2000',
        '-rtmp_live', 'live',
        '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)',
      ]),
      '-rw_timeout', '5000000',
      ...(isVirtualCam ? [] : [
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '2',
      ]),
      // x264 VBV buffer 2× bitrate gives the encoder room to vary bitrate
      // across complex/simple frames without forcing keyframes or lowering quality.
      '-bufsize', `${config.bitrateKbps * 2}k`,
      fullUrl
    ]
  }

  public async buildRecordArgs(config: RecordingConfig, bestEncoder: string): Promise<string[]> {
    if (!config.outputPath) throw new Error('Recording output path is required')

    const inputFormat = config.inputFormat || 'mjpeg'
    const audioFormat = config.audioFormat || 'silent'

    // Support explicit encoder selection or fallback to best detected
    const selectedEncoder = (config.encoder && config.encoder !== 'auto') ? config.encoder : bestEncoder
    const encoder = inputFormat === 'h264' ? 'copy' : selectedEncoder

    // Container specific flags
    const extension = config.outputPath.split('.').pop()?.toLowerCase()
    const requestedContainer = config.container || extension
    const containerFormat =
      requestedContainer === 'mkv' ? 'matroska' :
      requestedContainer === 'mp4' ? 'mp4' :
      requestedContainer === 'mov' ? 'mov' :
      'flv'

    return [
      ...(inputFormat === 'h264'
        ? this.buildH264PipeInput(config.width, config.height, config.fps, audioFormat, config.audioSampleRate)
        : this.buildImagePipeInput(config.width, config.height, config.fps, audioFormat, config.audioSampleRate)),
      ...this.encoderResolver.getEncoderArgs(encoder, { ...config, inputFormat }, 'record'),
      ...this.buildInputMap(audioFormat),
      '-c:a', 'aac',
      '-b:a', `${config.audioBitrate || 192}k`,
      '-ar', '48000',
      '-ac', '2',
      ...(containerFormat === 'mp4' ? ['-movflags', '+faststart'] : []),
      '-shortest',
      '-f', containerFormat,
      '-n', config.outputPath
    ]
  }

}
