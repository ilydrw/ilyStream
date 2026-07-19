import { execFile } from 'child_process'
import { promisify } from 'util'
import type { RecordingConfig, RecordingVideoCodec, RecordingVideoEncoder } from '../streaming-types'

const execFileAsync = promisify(execFile)

type EncoderMode = 'stream' | 'record'
const H264_ENCODERS = ['h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264'] as const
const HEVC_ENCODERS = ['hevc_amf', 'hevc_nvenc', 'hevc_qsv', 'libx265'] as const

export function isHevcEncoder(encoder?: string): boolean {
  return !!encoder && HEVC_ENCODERS.includes(encoder as any)
}

export function isH264Encoder(encoder?: string): boolean {
  return !!encoder && H264_ENCODERS.includes(encoder as any)
}

export function resolveRecordingCodec(config: Pick<RecordingConfig, 'codec' | 'encoder'>): RecordingVideoCodec {
  if (config.codec === 'h265' || config.codec === 'h264') return config.codec
  return isHevcEncoder(config.encoder) ? 'h265' : 'h264'
}

export class StreamingEncoderResolver {
  private availableEncoders: Set<string> | null = null
  private encoderProbeCache = new Map<string, boolean>()
  private gpuInfo: string | null = null
  private bestEncoderCache = new Map<RecordingVideoCodec, Promise<RecordingVideoEncoder>>()

  constructor(private readonly ffmpegBinary: string) {}

  /**
   * Pre-resolve the encoder at app startup (in the background) so the first
   * go-live doesn't pay for the GPU/ffmpeg probes. Safe to call repeatedly.
   */
  warmUp(codec: RecordingVideoCodec = 'h264'): void {
    void this.getBestEncoder(codec).catch(() => {})
  }

  async getBestEncoder(codec: RecordingVideoCodec = 'h264'): Promise<RecordingVideoEncoder> {
    // Cache the resolution promise per codec so concurrent starts (multistream
    // fires several at once) share one probe pass instead of racing.
    const cached = this.bestEncoderCache.get(codec)
    if (cached) return cached
    const promise = this.resolveBestEncoder(codec).catch((err) => {
      this.bestEncoderCache.delete(codec) // allow retry after a failure
      throw err
    })
    this.bestEncoderCache.set(codec, promise)
    return promise
  }

  private async resolveBestEncoder(codec: RecordingVideoCodec): Promise<RecordingVideoEncoder> {
    const gpuInfo = await this.getGpuInfo()
    const candidates: string[] = []

    if (codec === 'h265') {
      if (/nvidia/i.test(gpuInfo)) candidates.push('hevc_nvenc')
      if (/amd|radeon/i.test(gpuInfo)) candidates.push('hevc_amf')
      if (/intel/i.test(gpuInfo)) candidates.push('hevc_qsv')
      candidates.push('hevc_amf', 'hevc_nvenc', 'hevc_qsv', 'libx265')
    } else {
      if (/nvidia/i.test(gpuInfo)) candidates.push('h264_nvenc')
      if (/amd|radeon/i.test(gpuInfo)) candidates.push('h264_amf')
      if (/intel/i.test(gpuInfo)) candidates.push('h264_qsv')
      candidates.push('h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264')
    }

    for (const encoder of [...new Set(candidates)]) {
      if (!(await this.isEncoderAvailable(encoder))) continue
      if (!(await this.probeEncoder(encoder))) continue
      console.log(`[Streaming] Selected encoder: ${encoder}${gpuInfo ? ` (${gpuInfo.replace(/\s+/g, ' ').trim()})` : ''}`)
      return encoder as RecordingVideoEncoder
    }

    if (codec === 'h265') {
      throw new Error('No H.265 encoder is available in the bundled FFmpeg build or current GPU driver')
    }

    console.warn('[Streaming] No hardware encoder passed probing, falling back to software x264')
    return 'libx264'
  }

  getEncoderArgs(
    encoder: string,
    config: Pick<RecordingConfig, 'fps' | 'bitrateKbps' | 'crf' | 'colorProfile'>,
    mode: EncoderMode
  ): string[] {
    const args = ['-c:v', encoder]
    const fps = Math.max(1, Math.round(config.fps || 30))
    const gop = fps * 2
    const hdr10 = config.colorProfile === 'hdr10-pq'

    if (encoder === 'copy') return args
    if (hdr10 && !isHevcEncoder(encoder) && encoder !== 'libx265') {
      throw new Error(`Encoder ${encoder} cannot produce the required 10-bit HDR10 HEVC output`)
    }

    if (encoder === 'libx264') {
      if (mode === 'stream') {
        args.push('-preset', 'veryfast')
        // nal-hrd=cbr + bitrate=maxrate=minrate makes x264 emit a true CBR
        // stream Twitch ingest is happy with. scenecut=0 prevents x264 from
        // inserting an unrequested IDR mid-GOP, which spikes the bitrate.
        args.push(
          '-tune', 'zerolatency',
          '-profile:v', 'high',
          '-bf', '0',
          '-sc_threshold', '0',
          '-x264-params', `nal-hrd=cbr:scenecut=0:force-cfr=1:keyint=${gop}:min-keyint=${gop}`
        )
      } else {
        args.push('-preset', 'medium')
        args.push('-crf', config.crf?.toString() || '18')
      }
    } else if (encoder === 'h264_nvenc') {
      args.push('-preset', mode === 'stream' ? 'p4' : 'p6')
      if (mode === 'stream') {
        // -rc cbr + -no-scenecut keeps the bitrate ceiling honest. spatial/
        // temporal AQ are basically free on Turing+ and meaningfully improve
        // quality at streaming bitrates. -rc-lookahead 0 keeps end-to-end
        // latency low.
        args.push(
          '-tune', 'll',
          '-profile:v', 'high',
          '-rc', 'cbr',
          '-bf', '0',
          '-zerolatency', '1',
          '-no-scenecut', '1',
          '-forced-idr', '1',
          '-strict_gop', '1',
          '-spatial-aq', '1',
          '-temporal-aq', '1',
          '-rc-lookahead', '0'
        )
      } else {
        args.push('-tune', 'hq', '-rc', 'vbr', '-cq', config.crf?.toString() || '20')
      }
    } else if (encoder === 'h264_amf') {
      args.push('-quality', mode === 'stream' ? 'speed' : 'quality', '-usage', mode === 'stream' ? 'lowlatency' : 'transcoding')
      if (mode === 'stream') {
        // enforce_hrd=1 + filler_data=1 keeps AMF's output bitstream truly
        // CBR even on low-motion scenes (without filler it pads silently
        // and Twitch sometimes reads the gaps as a network blip).
        args.push(
          '-rc', 'cbr',
          '-profile:v', 'high',
          '-bf', '0',
          '-max_b_frames', '0',
          '-enforce_hrd', '1',
          '-filler_data', '1'
        )
      } else {
        args.push('-rc', 'vbr_latency')
      }
    } else if (encoder === 'h264_qsv') {
      args.push('-preset', mode === 'stream' ? 'veryfast' : 'faster')
      if (mode === 'stream') {
        // -rc cbr explicitly + async_depth=1 keeps the QSV pipeline shallow
        // enough that hitches don't propagate as a stream-side stall.
        args.push(
          '-profile:v', 'high',
          '-bf', '0',
          '-look_ahead', '0',
          '-rc:v', 'cbr',
          '-forced_idr', '1',
          '-async_depth', '1',
          '-low_power', '0'
        )
      } else {
        args.push('-global_quality', config.crf?.toString() || '20', '-look_ahead', '1')
      }
    } else if (encoder === 'libx265') {
      if (hdr10) args.push('-profile:v', 'main10')
      if (mode === 'stream') {
        args.push(
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-x265-params', `log-level=error:keyint=${gop}:min-keyint=${gop}:scenecut=0:repeat-headers=1`
        )
      } else {
        args.push(
          '-preset', 'medium',
          '-crf', config.crf?.toString() || '20',
          '-x265-params', `log-level=error:keyint=${gop}:min-keyint=${gop}:scenecut=0`
        )
      }
    } else if (encoder === 'hevc_nvenc') {
      args.push('-preset', mode === 'stream' ? 'p4' : 'p6')
      if (mode === 'stream') {
        args.push(
          '-tune', 'll',
          '-profile:v', hdr10 ? 'main10' : 'main',
          '-rc', 'cbr',
          '-bf', '0',
          '-zerolatency', '1',
          '-no-scenecut', '1',
          '-forced-idr', '1',
          '-strict_gop', '1',
          '-spatial-aq', '1',
          '-temporal-aq', '1',
          '-rc-lookahead', '0'
        )
      } else {
        args.push('-tune', 'hq', '-profile:v', hdr10 ? 'main10' : 'main', '-rc', 'vbr', '-cq', config.crf?.toString() || '20')
      }
    } else if (encoder === 'hevc_amf') {
      args.push('-quality', mode === 'stream' ? 'speed' : 'quality', '-usage', mode === 'stream' ? 'lowlatency' : 'transcoding')
      if (mode === 'stream') {
        args.push('-rc', 'cbr', '-profile:v', hdr10 ? 'main10' : 'main', '-bf', '0', '-max_b_frames', '0', '-enforce_hrd', '1', '-filler_data', '1')
      } else {
        args.push('-rc', 'vbr_latency', '-profile:v', hdr10 ? 'main10' : 'main')
      }
    } else if (encoder === 'hevc_qsv') {
      args.push('-preset', mode === 'stream' ? 'veryfast' : 'faster')
      if (mode === 'stream') {
        args.push('-profile:v', hdr10 ? 'main10' : 'main', '-bf', '0', '-look_ahead', '0', '-rc:v', 'cbr', '-forced_idr', '1', '-async_depth', '1', '-low_power', '0')
      } else {
        args.push('-profile:v', hdr10 ? 'main10' : 'main', '-global_quality', config.crf?.toString() || '20', '-look_ahead', '1')
      }
    }

    if (mode === 'stream') {
      args.push(
        '-b:v', `${config.bitrateKbps}k`,
        '-maxrate', `${config.bitrateKbps}k`,
        '-minrate', `${config.bitrateKbps}k`,
        '-bufsize', `${config.bitrateKbps * 2}k`
      )
    } else if (!args.includes('-crf') && !args.includes('-cq') && !args.includes('-global_quality')) {
      args.push('-b:v', `${Math.max(config.bitrateKbps * 1.5, 8000)}k`)
    }

    args.push(
      '-pix_fmt', hdr10 ? 'p010le' : 'yuv420p',
      '-g', `${gop}`,
      '-keyint_min', `${gop}`
    )

    if (!isHevcEncoder(encoder)) args.push('-level:v', '4.2')

    return args
  }

  private async getGpuInfo(): Promise<string> {
    if (this.gpuInfo !== null) return this.gpuInfo
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join \"`n\""
      ], {
        encoding: 'utf8',
        timeout: 4000,
        windowsHide: true
      })
      this.gpuInfo = stdout.trim()
    } catch {
      this.gpuInfo = ''
    }
    return this.gpuInfo
  }

  private async getAvailableEncoders(): Promise<Set<string>> {
    if (this.availableEncoders) return this.availableEncoders
    try {
      const { stdout } = await execFileAsync(this.ffmpegBinary, ['-hide_banner', '-encoders'], {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        timeout: 8000,
        windowsHide: true
      })
      this.availableEncoders = new Set([
        ...H264_ENCODERS,
        ...HEVC_ENCODERS
      ].filter(encoder => stdout.includes(encoder)))
    } catch (error) {
      console.warn('[Streaming] Could not inspect FFmpeg encoders:', error instanceof Error ? error.message : String(error))
      this.availableEncoders = new Set(['libx264'])
    }
    return this.availableEncoders
  }

  private async isEncoderAvailable(encoder: string): Promise<boolean> {
    return (await this.getAvailableEncoders()).has(encoder)
  }

  private async probeEncoder(encoder: string): Promise<boolean> {
    const cached = this.encoderProbeCache.get(encoder)
    if (cached !== undefined) return cached

    let ok = false
    try {
      await execFileAsync(this.ffmpegBinary, [
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'lavfi',
        '-i', 'testsrc2=size=128x72:rate=30',
        '-t', '0.5',
        '-c:v', encoder,
        '-f', 'null',
        '-'
      ], {
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true
      })
      ok = true
    } catch (err: any) {
      const stderr = (err?.stderr || '').toString().split(/\r?\n/).filter(Boolean).slice(-2).join(' | ')
      console.warn(`[Streaming] Encoder ${encoder} probe failed${stderr ? `: ${stderr}` : ''}`)
      ok = false
    }
    this.encoderProbeCache.set(encoder, ok)
    return ok
  }
}
