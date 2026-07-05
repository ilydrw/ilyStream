import type { StreamConfig, RecordingConfig } from '../streaming-types'
import { isH264Encoder, isHevcEncoder, resolveRecordingCodec } from './encoder-resolver'

export class FFmpegArgsBuilder {
  constructor(private encoderResolver: any) {}

  public buildAudioInput(audioFormat: 'f32le' | 'silent' = 'silent', sampleRate: number = 48000): string[] {
    if (audioFormat === 'f32le') {
      return [
        '-thread_queue_size', '2048',
        '-f', 'f32le',
        '-ar', String(sampleRate),
        '-ac', '2',
        // Let the raw PCM demuxer derive PTS from sample count. Arrival
        // wall-clock timestamps make GC and IPC jitter look like real audio
        // drift, which is exactly how slow desync sneaks into long streams.
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
      // Per-input probe limits — FFmpeg's defaults (5MB / 5s) make it wait
      // multiple seconds before forwarding the first frame, which on RTMP
      // shows up as "stream is starting" stalling for 6+ seconds on Twitch.
      '-probesize', '32',
      '-analyzeduration', '0',
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
      // Annex-B NAL stream — FFmpeg needs to see at least one SPS+PPS+IDR
      // to lock parameters, but that comes in the first ~50KB of the
      // stream we feed. 256KB / 200ms is more than enough headroom.
      '-probesize', '256K',
      '-analyzeduration', '200000',
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
      ...(copyEncodedVideo ? [] : ['-r', String(config.fps), '-fps_mode', 'cfr']),
      ...this.buildInputMap(audioFormat),
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '48000',
      '-ac', '2',
      // Keep audio sample-count clocked from first_pts=0. async=1000 lets
      // FFmpeg smooth tiny device-rate differences without hard drops/dupes.
      '-af', 'aresample=async=1000:first_pts=0',
      '-avoid_negative_ts', 'make_zero',
      '-max_interleave_delta', '0',
      ...(isVirtualCam ? [] : ['-flvflags', 'no_duration_filesize+add_keyframe_index']),
      // flush_packets=1 sends each muxed packet immediately instead of letting
      // the FLV muxer batch them. Combined with tcp_nodelay below, this is
      // what keeps the on-the-wire bitrate matching the encoder's intent
      // tick-for-tick — without it, RTMP sends in bursts and Twitch's ingest
      // sees the gaps as the upstream stalling.
      ...(isVirtualCam ? [] : ['-flush_packets', '1']),
      // max_interleave_delta=0 above already keeps A/V interleave tight; here
      // max_delay=0 disables FFmpeg's input demux reorder window so we don't
      // sit on packets waiting for an out-of-order one that will never come.
      '-max_delay', '0',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-f', format,
      ...(isVirtualCam ? [] : [
        '-tcp_nodelay', '1',
        // 3-second send buffer absorbs Wi-Fi reassociation / brief upload jitter.
        // Previously `0` meant any 30 ms hiccup stalled the encoder; 2s was
        // borderline for some home connections — 3s is what OBS defaults to.
        '-rtmp_buffer', '3000',
        '-rtmp_live', 'live',
        '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)',
      ]),
      // 10s rw timeout (was 5s) — gives the reconnect chain a real shot at
      // recovering before FFmpeg gives up. Twitch's edge can take 6-8s to
      // accept a fresh handshake after a transient drop.
      '-rw_timeout', '10000000',
      ...(isVirtualCam ? [] : [
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '4',
      ]),
      fullUrl
    ]
  }

  public async buildRecordArgs(config: RecordingConfig, bestEncoder: string): Promise<string[]> {
    if (!config.outputPath) throw new Error('Recording output path is required')

    const inputFormat = config.inputFormat || 'mjpeg'
    const audioFormat = config.audioFormat || 'silent'
    const recordingCodec = resolveRecordingCodec(config)

    // Support explicit encoder selection or fallback to best detected
    const explicitEncoder = config.encoder && config.encoder !== 'auto' ? config.encoder : undefined
    const selectedEncoder = explicitEncoder && (
      (recordingCodec === 'h265' && isHevcEncoder(explicitEncoder)) ||
      (recordingCodec === 'h264' && isH264Encoder(explicitEncoder))
    )
      ? explicitEncoder
      : bestEncoder
    const encoder = recordingCodec === 'h264' && inputFormat === 'h264' ? 'copy' : selectedEncoder

    // Container specific flags
    const extension = config.outputPath.split('.').pop()?.toLowerCase()
    const requestedContainer = config.container || extension
    const containerFormat =
      requestedContainer === 'mkv' ? 'matroska' :
      requestedContainer === 'mp4' ? 'mp4' :
      requestedContainer === 'mov' ? 'mov' :
      recordingCodec === 'h265' ? 'matroska' :
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
      ...(audioFormat === 'f32le' ? ['-af', 'aresample=async=1000:first_pts=0'] : []),
      ...(containerFormat === 'mp4' ? ['-movflags', '+faststart'] : []),
      ...(recordingCodec === 'h265' && (containerFormat === 'mp4' || containerFormat === 'mov') ? ['-tag:v', 'hvc1'] : []),
      '-shortest',
      '-f', containerFormat,
      '-n', config.outputPath
    ]
  }

}
