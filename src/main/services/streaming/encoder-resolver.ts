import { execFileSync, spawnSync } from 'child_process'
import type { StreamConfig } from '../streaming-types'

type EncoderMode = 'stream' | 'record'

export class StreamingEncoderResolver {
  private availableEncoders: Set<string> | null = null
  private encoderProbeCache = new Map<string, boolean>()

  constructor(private readonly ffmpegBinary: string) {}

  async getBestEncoder(): Promise<string> {
    const gpuInfo = this.getGpuInfo()
    const candidates: string[] = []

    if (/nvidia/i.test(gpuInfo)) candidates.push('h264_nvenc')
    if (/amd|radeon/i.test(gpuInfo)) candidates.push('h264_amf')
    if (/intel/i.test(gpuInfo)) candidates.push('h264_qsv')
    candidates.push('h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264')

    for (const encoder of [...new Set(candidates)]) {
      if (!this.isEncoderAvailable(encoder)) continue
      if (!this.probeEncoder(encoder)) continue
      console.log(`[Streaming] Selected encoder: ${encoder}${gpuInfo ? ` (${gpuInfo.replace(/\s+/g, ' ').trim()})` : ''}`)
      return encoder
    }

    console.warn('[Streaming] No hardware encoder passed probing, falling back to software x264')
    return 'libx264'
  }

  getEncoderArgs(
    encoder: string,
    config: Pick<StreamConfig, 'fps' | 'bitrateKbps'>,
    mode: EncoderMode
  ): string[] {
    const args = ['-c:v', encoder]

    if (encoder === 'libx264') {
      args.push('-preset', mode === 'stream' ? 'veryfast' : 'medium')
      if (mode === 'stream') {
        args.push('-tune', 'zerolatency', '-profile:v', 'high', '-bf', '0', '-x264-params', 'nal-hrd=cbr:scenecut=0')
      } else {
        args.push('-crf', '18') // High quality for recording
      }
    } else if (encoder === 'h264_nvenc') {
      args.push('-preset', mode === 'stream' ? 'p4' : 'p6')
      if (mode === 'stream') {
        args.push('-tune', 'll', '-profile:v', 'high', '-rc', 'cbr', '-bf', '0', '-zerolatency', '1')
      } else {
        args.push('-tune', 'hq', '-rc', 'vbr', '-cq', '20')
      }
    } else if (encoder === 'h264_amf') {
      args.push('-quality', mode === 'stream' ? 'speed' : 'quality', '-usage', mode === 'stream' ? 'lowlatency' : 'transcoding')
      if (mode === 'stream') {
        args.push('-rc', 'cbr', '-profile:v', 'high', '-bf', '0', '-max_b_frames', '0', '-enforce_hrd', '1')
      } else {
        args.push('-rc', 'vbr_latency')
      }
    } else if (encoder === 'h264_qsv') {
      args.push('-preset', mode === 'stream' ? 'veryfast' : 'faster')
      if (mode === 'stream') {
        args.push('-profile:v', 'high', '-bf', '0', '-look_ahead', '0')
      } else {
        args.push('-global_quality', '20', '-look_ahead', '1')
      }
    }

    if (mode === 'stream') {
      args.push(
        '-b:v', `${config.bitrateKbps}k`,
        '-maxrate', `${config.bitrateKbps}k`,
        '-minrate', `${config.bitrateKbps}k`,
        '-bufsize', `${config.bitrateKbps}k`
      )
    } else if (!args.includes('-crf') && !args.includes('-cq') && !args.includes('-global_quality')) {
      // Fallback for QSV or others if no quality-based rate control was set above
      args.push('-b:v', `${Math.max(config.bitrateKbps * 1.5, 8000)}k`)
    }

    args.push(
      '-pix_fmt', 'yuv420p',
      '-g', `${config.fps * 2}`,
      '-keyint_min', `${config.fps * 2}`,
      '-level:v', '4.2'
    )

    return args
  }

  private getGpuInfo(): string {
    try {
      return execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join \"`n\""
      ], {
        encoding: 'utf8',
        timeout: 4000,
        windowsHide: true
      }).trim()
    } catch {
      return ''
    }
  }

  private getAvailableEncoders(): Set<string> {
    if (this.availableEncoders) return this.availableEncoders
    try {
      const output = execFileSync(this.ffmpegBinary, ['-hide_banner', '-encoders'], {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        timeout: 8000,
        windowsHide: true
      })
      this.availableEncoders = new Set(['h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264'].filter(encoder => output.includes(encoder)))
    } catch (error) {
      console.warn('[Streaming] Could not inspect FFmpeg encoders:', error instanceof Error ? error.message : String(error))
      this.availableEncoders = new Set(['libx264'])
    }
    return this.availableEncoders
  }

  private isEncoderAvailable(encoder: string): boolean {
    return this.getAvailableEncoders().has(encoder)
  }

  private probeEncoder(encoder: string): boolean {
    const cached = this.encoderProbeCache.get(encoder)
    if (cached !== undefined) return cached

    const result = spawnSync(this.ffmpegBinary, [
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

    const ok = result.status === 0
    if (!ok) {
      const stderr = (result.stderr || '').split(/\r?\n/).filter(Boolean).slice(-2).join(' | ')
      console.warn(`[Streaming] Encoder ${encoder} probe failed${stderr ? `: ${stderr}` : ''}`)
    }
    this.encoderProbeCache.set(encoder, ok)
    return ok
  }
}

