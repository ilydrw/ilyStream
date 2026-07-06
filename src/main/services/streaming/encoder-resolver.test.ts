import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- child_process mock -----------------------------------------------------
// encoder-resolver does `const execFileAsync = promisify(execFile)` at module
// load, so our mocked execFile must carry a promisify.custom implementation
// that resolves the `{ stdout, stderr }` shape the code destructures. We drive
// the returned stdout per-call via `execFileImpl` so individual tests can stub
// GPU detection, the `-encoders` listing and the encode probe independently.
type ExecFileArgs = [string, string[], Record<string, unknown>]
let execFileImpl: (...args: ExecFileArgs) => Promise<{ stdout: string; stderr: string }>

// The code only ever calls the promisified form, so this custom spy is what
// actually receives every invocation — count calls here, not on the raw fn.
const promisifiedExecFile = vi.fn((...args: ExecFileArgs) => execFileImpl(...args))

const execFileMock = vi.fn((..._args: ExecFileArgs) => {
  // Callback form is never exercised (code only uses the promisified custom),
  // but return a throwaway so a stray call doesn't explode.
  return undefined as any
})
;(execFileMock as any)[promisify.custom] = promisifiedExecFile

vi.mock('child_process', () => ({
  execFile: execFileMock
}))

// Imported after the mock is registered so the promisify() at module top picks
// up the mocked execFile.
const { StreamingEncoderResolver, isH264Encoder, isHevcEncoder, resolveRecordingCodec } = await import(
  './encoder-resolver'
)

const FFMPEG = 'C:/fake/ffmpeg.exe'

beforeEach(() => {
  execFileMock.mockClear()
  promisifiedExecFile.mockClear()
  // Default: no GPU, ffmpeg reports every encoder, every probe succeeds.
  execFileImpl = async (bin, args) => {
    if (bin === 'powershell.exe') return { stdout: '', stderr: '' }
    if (args.includes('-encoders')) {
      return {
        stdout:
          'h264_amf h264_nvenc h264_qsv libx264 hevc_amf hevc_nvenc hevc_qsv libx265',
        stderr: ''
      }
    }
    return { stdout: '', stderr: '' }
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isH264Encoder / isHevcEncoder', () => {
  it('recognises every known H.264 encoder', () => {
    for (const enc of ['h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264']) {
      expect(isH264Encoder(enc)).toBe(true)
      expect(isHevcEncoder(enc)).toBe(false)
    }
  })

  it('recognises every known HEVC encoder', () => {
    for (const enc of ['hevc_amf', 'hevc_nvenc', 'hevc_qsv', 'libx265']) {
      expect(isHevcEncoder(enc)).toBe(true)
      expect(isH264Encoder(enc)).toBe(false)
    }
  })

  it('returns false for unknown and undefined encoders', () => {
    expect(isH264Encoder('copy')).toBe(false)
    expect(isHevcEncoder('copy')).toBe(false)
    expect(isH264Encoder('vp9')).toBe(false)
    expect(isHevcEncoder('av1')).toBe(false)
    expect(isH264Encoder(undefined)).toBe(false)
    expect(isHevcEncoder(undefined)).toBe(false)
    expect(isH264Encoder('')).toBe(false)
    expect(isHevcEncoder('')).toBe(false)
  })
})

describe('resolveRecordingCodec', () => {
  it('honours an explicit h264 codec regardless of encoder', () => {
    expect(resolveRecordingCodec({ codec: 'h264', encoder: 'hevc_nvenc' })).toBe('h264')
  })

  it('honours an explicit h265 codec regardless of encoder', () => {
    expect(resolveRecordingCodec({ codec: 'h265', encoder: 'libx264' })).toBe('h265')
  })

  it('infers h265 from an HEVC encoder when codec is unset', () => {
    expect(resolveRecordingCodec({ codec: undefined, encoder: 'hevc_amf' })).toBe('h265')
    expect(resolveRecordingCodec({ codec: undefined, encoder: 'libx265' })).toBe('h265')
  })

  it('infers h264 from a non-HEVC or missing encoder when codec is unset', () => {
    expect(resolveRecordingCodec({ codec: undefined, encoder: 'libx264' })).toBe('h264')
    expect(resolveRecordingCodec({ codec: undefined, encoder: 'auto' })).toBe('h264')
    expect(resolveRecordingCodec({ codec: undefined, encoder: undefined })).toBe('h264')
  })
})

describe('getEncoderArgs', () => {
  const resolver = new StreamingEncoderResolver(FFMPEG)
  const streamCfg = { fps: 30, bitrateKbps: 6000, crf: 18 }

  it("returns only ['-c:v','copy'] for the copy passthrough", () => {
    expect(resolver.getEncoderArgs('copy', streamCfg, 'stream')).toEqual(['-c:v', 'copy'])
    expect(resolver.getEncoderArgs('copy', streamCfg, 'record')).toEqual(['-c:v', 'copy'])
  })

  it('builds a CBR low-latency libx264 stream command', () => {
    const args = resolver.getEncoderArgs('libx264', streamCfg, 'stream')
    const gop = 60 // fps(30) * 2

    expect(args.slice(0, 2)).toEqual(['-c:v', 'libx264'])
    expect(args).toContain('-preset')
    expect(args[args.indexOf('-preset') + 1]).toBe('veryfast')
    expect(args).toContain('-tune')
    expect(args[args.indexOf('-tune') + 1]).toBe('zerolatency')

    const x264Params = args[args.indexOf('-x264-params') + 1]
    expect(x264Params).toContain('nal-hrd=cbr')
    expect(x264Params).toContain(`keyint=${gop}`)
    expect(x264Params).toContain(`min-keyint=${gop}`)

    // CBR rate control: b:v = maxrate = minrate = bitrate, bufsize = 2x.
    expect(args[args.indexOf('-b:v') + 1]).toBe('6000k')
    expect(args[args.indexOf('-maxrate') + 1]).toBe('6000k')
    expect(args[args.indexOf('-minrate') + 1]).toBe('6000k')
    expect(args[args.indexOf('-bufsize') + 1]).toBe('12000k')

    // Shared tail.
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p')
    expect(args[args.indexOf('-g') + 1]).toBe(`${gop}`)
    expect(args[args.indexOf('-keyint_min') + 1]).toBe(`${gop}`)
    expect(args[args.indexOf('-level:v') + 1]).toBe('4.2')

    // Stream mode is CBR, never CRF.
    expect(args).not.toContain('-crf')
  })

  it('builds a CRF libx264 record command with no CBR rate flags', () => {
    const args = resolver.getEncoderArgs('libx264', { fps: 30, bitrateKbps: 6000, crf: 18 }, 'record')
    expect(args[args.indexOf('-preset') + 1]).toBe('medium')
    expect(args[args.indexOf('-crf') + 1]).toBe('18')
    // CBR-only flags must not appear in record mode.
    expect(args).not.toContain('-maxrate')
    expect(args).not.toContain('-minrate')
    expect(args).not.toContain('-bufsize')
    expect(args).not.toContain('-b:v')
  })

  it('defaults libx264 record CRF to 18 when crf is omitted', () => {
    const args = resolver.getEncoderArgs('libx264', { fps: 30, bitrateKbps: 6000 } as any, 'record')
    expect(args[args.indexOf('-crf') + 1]).toBe('18')
  })

  it('builds an NVENC hardware CBR stream command', () => {
    const args = resolver.getEncoderArgs('h264_nvenc', streamCfg, 'stream')
    expect(args.slice(0, 2)).toEqual(['-c:v', 'h264_nvenc'])
    // Hardware CBR rate control.
    expect(args[args.indexOf('-rc') + 1]).toBe('cbr')
    // Shared CBR bitrate block still applied for hardware encoders.
    expect(args[args.indexOf('-b:v') + 1]).toBe('6000k')
    expect(args[args.indexOf('-maxrate') + 1]).toBe('6000k')
    expect(args[args.indexOf('-minrate') + 1]).toBe('6000k')
    expect(args[args.indexOf('-bufsize') + 1]).toBe('12000k')
    // Shared tail + non-HEVC level.
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p')
    expect(args[args.indexOf('-g') + 1]).toBe('60')
    expect(args[args.indexOf('-keyint_min') + 1]).toBe('60')
    expect(args[args.indexOf('-level:v') + 1]).toBe('4.2')
  })

  it('omits -level:v 4.2 for HEVC encoders but keeps the shared tail', () => {
    const args = resolver.getEncoderArgs('hevc_nvenc', streamCfg, 'stream')
    expect(args).not.toContain('-level:v')
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p')
    expect(args[args.indexOf('-g') + 1]).toBe('60')
    expect(args[args.indexOf('-keyint_min') + 1]).toBe('60')
  })

  it('derives GOP from fps (fps * 2)', () => {
    const args60 = resolver.getEncoderArgs('libx264', { fps: 60, bitrateKbps: 6000 } as any, 'stream')
    expect(args60[args60.indexOf('-g') + 1]).toBe('120')
    expect(args60[args60.indexOf('-keyint_min') + 1]).toBe('120')
  })

  it('treats a falsy fps as the default 30 (via `config.fps || 30`)', () => {
    // `config.fps || 30` short-circuits 0 to 30, so gop = 30 * 2 = 60. The
    // Math.max(1, round(fps)) clamp only guards fractional/negative values.
    const argsZero = resolver.getEncoderArgs('libx264', { fps: 0, bitrateKbps: 6000 } as any, 'stream')
    expect(argsZero[argsZero.indexOf('-g') + 1]).toBe('60')

    // A fractional fps rounds: 23.976 -> 24 -> gop 48.
    const argsFrac = resolver.getEncoderArgs('libx264', { fps: 23.976, bitrateKbps: 6000 } as any, 'stream')
    expect(argsFrac[argsFrac.indexOf('-g') + 1]).toBe('48')
  })
})

describe('getBestEncoder / warmUp (mocked child_process)', () => {
  it('resolves to a candidate and caches the probe pass per codec', async () => {
    const resolver = new StreamingEncoderResolver(FFMPEG)

    const first = await resolver.getBestEncoder('h264')
    expect(first).toBe('h264_amf') // first available candidate with no GPU hint
    const callsAfterFirst = promisifiedExecFile.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    // Second call for the same codec shares the cached promise: no new probes.
    const second = await resolver.getBestEncoder('h264')
    expect(second).toBe('h264_amf')
    expect(promisifiedExecFile.mock.calls.length).toBe(callsAfterFirst)
  })

  it('prefers an NVENC candidate when the GPU reports NVIDIA', async () => {
    execFileImpl = async (bin, args) => {
      if (bin === 'powershell.exe') return { stdout: 'NVIDIA GeForce RTX 4090', stderr: '' }
      if (args.includes('-encoders')) {
        return { stdout: 'h264_amf h264_nvenc h264_qsv libx264', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    }
    const resolver = new StreamingEncoderResolver(FFMPEG)
    expect(await resolver.getBestEncoder('h264')).toBe('h264_nvenc')
  })

  it('falls back to libx264 when every hardware probe fails', async () => {
    execFileImpl = async (bin, args) => {
      if (bin === 'powershell.exe') return { stdout: '', stderr: '' }
      if (args.includes('-encoders')) {
        return { stdout: 'h264_amf h264_nvenc h264_qsv libx264', stderr: '' }
      }
      // Any encode probe throws -> treated as unavailable/failed.
      const err: any = new Error('probe failed')
      err.stderr = 'Unknown encoder'
      throw err
    }
    const resolver = new StreamingEncoderResolver(FFMPEG)
    expect(await resolver.getBestEncoder('h264')).toBe('libx264')
  })

  it('rejects for h265 when no HEVC encoder is available, and allows retry', async () => {
    execFileImpl = async (bin, args) => {
      if (bin === 'powershell.exe') return { stdout: '', stderr: '' }
      if (args.includes('-encoders')) {
        return { stdout: 'libx264', stderr: '' } // no HEVC encoders listed
      }
      return { stdout: '', stderr: '' }
    }
    const resolver = new StreamingEncoderResolver(FFMPEG)
    await expect(resolver.getBestEncoder('h265')).rejects.toThrow(/H\.265/)
    // On failure the cache is cleared so a subsequent call re-probes.
    await expect(resolver.getBestEncoder('h265')).rejects.toThrow(/H\.265/)
  })

  it('warmUp() does not throw and never rejects even when probing fails', async () => {
    execFileImpl = async () => {
      throw new Error('everything is broken')
    }
    const resolver = new StreamingEncoderResolver(FFMPEG)
    expect(() => resolver.warmUp('h264')).not.toThrow()
    // Give the fire-and-forget promise a tick to settle without an unhandled rejection.
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  })
})
