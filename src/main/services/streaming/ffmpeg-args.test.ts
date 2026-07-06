import { describe, expect, it } from 'vitest'
import { FFmpegArgsBuilder } from './ffmpeg-args'
import type { StreamConfig, RecordingConfig } from '../streaming-types'

/**
 * Fake encoder resolver: returns a tiny, known array so the surrounding
 * ffmpeg args (which is what this builder actually assembles) can be asserted
 * deterministically without pulling in GPU probing / real ffmpeg.
 */
function makeFakeResolver() {
  const calls: Array<{ encoder: string; config: any; mode: string }> = []
  const resolver = {
    calls,
    getEncoderArgs(encoder: string, config: any, mode: string): string[] {
      calls.push({ encoder, config, mode })
      return ['-c:v', encoder]
    }
  }
  return resolver
}

function baseStreamConfig(overrides: Partial<StreamConfig> = {}): StreamConfig {
  return {
    rtmpUrl: 'rtmp://live.example/app',
    streamKey: 'key',
    width: 1280,
    height: 720,
    fps: 30,
    bitrateKbps: 6000,
    ...overrides
  }
}

function baseRecordConfig(overrides: Partial<RecordingConfig> = {}): RecordingConfig {
  return {
    width: 1280,
    height: 720,
    fps: 30,
    bitrateKbps: 6000,
    outputPath: 'C:/tmp/out.mkv',
    ...overrides
  }
}

/** Returns the flag values that immediately follow every occurrence of `flag`. */
function valuesAfter(args: string[], flag: string): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) out.push(args[i + 1])
  }
  return out
}

describe('FFmpegArgsBuilder.buildAudioInput', () => {
  const builder = new FFmpegArgsBuilder(makeFakeResolver())

  it('builds the raw-PCM pipe:3 input for f32le', () => {
    const args = builder.buildAudioInput('f32le', 48000)
    expect(args).toEqual([
      '-thread_queue_size', '2048',
      '-f', 'f32le',
      '-ar', '48000',
      '-ac', '2',
      '-i', 'pipe:3'
    ])
  })

  it('honors a custom sample rate for f32le', () => {
    const args = builder.buildAudioInput('f32le', 44100)
    expect(valuesAfter(args, '-ar')).toEqual(['44100'])
    expect(args).toContain('pipe:3')
  })

  it('builds an anullsrc lavfi input for silent (the default)', () => {
    const args = builder.buildAudioInput('silent', 48000)
    expect(args).toEqual([
      '-f', 'lavfi',
      '-i', 'anullsrc=r=48000:cl=stereo'
    ])
    // Silent audio never touches the pipe.
    expect(args).not.toContain('pipe:3')
  })

  it('defaults to silent at 48000 when called with no arguments', () => {
    const args = builder.buildAudioInput()
    expect(args).toEqual([
      '-f', 'lavfi',
      '-i', 'anullsrc=r=48000:cl=stereo'
    ])
  })
})

describe('FFmpegArgsBuilder image vs h264 pipe inputs', () => {
  const builder = new FFmpegArgsBuilder(makeFakeResolver())

  it('buildImagePipeInput uses image2pipe + mjpeg with probesize 32 / analyzeduration 0', () => {
    const args = builder.buildImagePipeInput(1920, 1080, 60, 'silent', 48000)
    const joined = args.join(' ')
    expect(joined).toContain('-f image2pipe')
    expect(joined).toContain('-c:v mjpeg')
    expect(joined).toContain('-s 1920x1080')
    expect(valuesAfter(args, '-framerate')).toEqual(['60'])
    expect(valuesAfter(args, '-probesize')).toEqual(['32'])
    expect(valuesAfter(args, '-analyzeduration')).toEqual(['0'])
    expect(valuesAfter(args, '-thread_queue_size')).toEqual(['1024'])
    // reads frames from stdin
    expect(joined).toContain('-i pipe:0')
    // appends the audio input (silent by default here)
    expect(joined).toContain('anullsrc=r=48000:cl=stereo')
  })

  it('buildH264PipeInput uses -f h264 with probesize 256K / analyzeduration 200000 and no -s/-c:v', () => {
    const args = builder.buildH264PipeInput(1920, 1080, 60, 'silent', 48000)
    const joined = args.join(' ')
    expect(joined).toContain('-f h264')
    // h264 annex-b pipe does NOT set an mjpeg decoder or explicit size
    expect(joined).not.toContain('image2pipe')
    expect(joined).not.toContain('-c:v mjpeg')
    expect(args).not.toContain('-s')
    expect(valuesAfter(args, '-probesize')).toEqual(['256K'])
    expect(valuesAfter(args, '-analyzeduration')).toEqual(['200000'])
    expect(valuesAfter(args, '-thread_queue_size')).toEqual(['2048'])
    expect(valuesAfter(args, '-framerate')).toEqual(['60'])
    expect(joined).toContain('-i pipe:0')
  })

  it('threads f32le audio input through the h264 pipe builder', () => {
    const args = builder.buildH264PipeInput(1280, 720, 30, 'f32le', 44100)
    const joined = args.join(' ')
    expect(joined).toContain('-f f32le')
    expect(joined).toContain('pipe:3')
    expect(valuesAfter(args, '-ar')).toEqual(['44100'])
  })
})

describe('FFmpegArgsBuilder.buildStreamArgs', () => {
  it('copies encoded video and OMITS the CFR flags for h264 input', async () => {
    const resolver = makeFakeResolver()
    const builder = new FFmpegArgsBuilder(resolver)
    const url = 'rtmp://live.twitch.tv/app/streamkey'
    const args = await builder.buildStreamArgs(
      baseStreamConfig({ inputFormat: 'h264' }),
      url,
      'h264_nvenc'
    )

    // copyEncodedVideo -> resolver asked for 'copy', not the detected encoder
    expect(resolver.calls[0].encoder).toBe('copy')
    expect(resolver.calls[0].mode).toBe('stream')
    expect(args).toContain('-c:v')
    expect(args).toContain('copy')

    // CFR flags are omitted when copying an already-encoded stream
    expect(args).not.toContain('-fps_mode')
    // -r for the CFR block should be absent (audio input uses -ar, not -r)
    expect(args).not.toContain('-r')
    expect(args).not.toContain('cfr')
  })

  it('encodes with the detected encoder and INCLUDES CFR flags for mjpeg input', async () => {
    const resolver = makeFakeResolver()
    const builder = new FFmpegArgsBuilder(resolver)
    const url = 'rtmp://live.twitch.tv/app/streamkey'
    const args = await builder.buildStreamArgs(
      baseStreamConfig({ inputFormat: 'mjpeg', fps: 30 }),
      url,
      'h264_nvenc'
    )

    expect(resolver.calls[0].encoder).toBe('h264_nvenc')
    // CFR block present: -r <fps> -fps_mode cfr
    const joined = args.join(' ')
    expect(joined).toContain('-r 30 -fps_mode cfr')
    expect(args).toContain('cfr')
  })

  it('always muxes audio as aac 160k @ 48000 stereo', async () => {
    const builder = new FFmpegArgsBuilder(makeFakeResolver())
    const args = await builder.buildStreamArgs(
      baseStreamConfig({ inputFormat: 'mjpeg' }),
      'rtmp://live.example/app/key',
      'libx264'
    )
    const joined = args.join(' ')
    expect(joined).toContain('-c:a aac')
    expect(joined).toContain('-b:a 160k')
    expect(valuesAfter(args, '-ar')).toContain('48000')
  })

  it('includes RTMP/flv reliability flags for an rtmp:// destination', async () => {
    const builder = new FFmpegArgsBuilder(makeFakeResolver())
    const url = 'rtmp://live.twitch.tv/app/streamkey'
    const args = await builder.buildStreamArgs(
      baseStreamConfig({ inputFormat: 'mjpeg' }),
      url,
      'libx264'
    )
    const joined = args.join(' ')

    // flv muxer selected
    expect(joined).toContain('-f flv')
    // flv-specific + rtmp reliability flags
    expect(joined).toContain('-flvflags no_duration_filesize+add_keyframe_index')
    expect(joined).toContain('-flush_packets 1')
    expect(joined).toContain('-tcp_nodelay 1')
    expect(joined).toContain('-rtmp_buffer 3000')
    expect(joined).toContain('-rtmp_live live')
    expect(joined).toContain('-reconnect 1')
    expect(joined).toContain('-reconnect_at_eof 1')
    expect(joined).toContain('-reconnect_streamed 1')
    expect(joined).toContain('-reconnect_delay_max 4')

    // The destination URL is always the very last arg.
    expect(args[args.length - 1]).toBe(url)
  })

  it('uses dshow and OMITS rtmp/flv flags for a Windows virtual-cam (video=) target', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const builder = new FFmpegArgsBuilder(makeFakeResolver())
      const url = 'video=OBS Virtual Camera'
      const args = await builder.buildStreamArgs(
        baseStreamConfig({ inputFormat: 'mjpeg' }),
        url,
        'libx264'
      )
      const joined = args.join(' ')

      expect(joined).toContain('-f dshow')
      expect(joined).not.toContain('flv')
      expect(joined).not.toContain('-flvflags')
      expect(joined).not.toContain('-flush_packets')
      expect(joined).not.toContain('-rtmp_buffer')
      expect(joined).not.toContain('-reconnect')
      expect(joined).not.toContain('-tcp_nodelay')

      expect(args[args.length - 1]).toBe(url)
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  it('uses v4l2 and OMITS rtmp/flv flags for a Linux /dev/video target', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    try {
      const builder = new FFmpegArgsBuilder(makeFakeResolver())
      const url = '/dev/video0'
      const args = await builder.buildStreamArgs(
        baseStreamConfig({ inputFormat: 'mjpeg' }),
        url,
        'libx264'
      )
      const joined = args.join(' ')

      expect(joined).toContain('-f v4l2')
      expect(joined).not.toContain('-flvflags')
      expect(joined).not.toContain('-rtmp_buffer')
      expect(args[args.length - 1]).toBe(url)
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })
})

describe('FFmpegArgsBuilder.buildRecordArgs', () => {
  it('throws when no output path is provided', async () => {
    const builder = new FFmpegArgsBuilder(makeFakeResolver())
    await expect(
      builder.buildRecordArgs(baseRecordConfig({ outputPath: undefined }), 'libx264')
    ).rejects.toThrow('Recording output path is required')
  })

  it('maps a .mkv output to the matroska muxer', async () => {
    const builder = new FFmpegArgsBuilder(makeFakeResolver())
    const args = await builder.buildRecordArgs(
      baseRecordConfig({ outputPath: 'C:/tmp/clip.mkv' }),
      'libx264'
    )
    expect(valuesAfter(args, '-f')).toContain('matroska')
    expect(args[args.length - 1]).toBe('C:/tmp/clip.mkv')
    // -n (never overwrite) precedes the output path
    expect(args[args.length - 2]).toBe('-n')
  })

  it('maps a .mp4 output to mp4 with +faststart movflags', async () => {
    const builder = new FFmpegArgsBuilder(makeFakeResolver())
    const args = await builder.buildRecordArgs(
      baseRecordConfig({ outputPath: 'C:/tmp/clip.mp4' }),
      'libx264'
    )
    const joined = args.join(' ')
    expect(valuesAfter(args, '-f')).toContain('mp4')
    expect(joined).toContain('-movflags +faststart')
  })

  it('forces matroska for h265 even when an flv container is requested', async () => {
    const builder = new FFmpegArgsBuilder(makeFakeResolver())
    const args = await builder.buildRecordArgs(
      baseRecordConfig({
        outputPath: 'C:/tmp/clip.flv',
        container: 'flv',
        codec: 'h265'
      }),
      'hevc_nvenc'
    )
    // flv is not one of mkv/mp4/mov, so h265 falls through to matroska.
    expect(valuesAfter(args, '-f')).toContain('matroska')
    expect(valuesAfter(args, '-f')).not.toContain('flv')
  })

  it('copies the video stream when recording codec h264 with h264 input', async () => {
    const resolver = makeFakeResolver()
    const builder = new FFmpegArgsBuilder(resolver)
    await builder.buildRecordArgs(
      baseRecordConfig({ inputFormat: 'h264', codec: 'h264' }),
      'h264_nvenc'
    )
    expect(resolver.calls[0].encoder).toBe('copy')
    expect(resolver.calls[0].mode).toBe('record')
  })

  it('does NOT copy (re-encodes) when input is mjpeg even with h264 codec', async () => {
    const resolver = makeFakeResolver()
    const builder = new FFmpegArgsBuilder(resolver)
    await builder.buildRecordArgs(
      baseRecordConfig({ inputFormat: 'mjpeg', codec: 'h264' }),
      'h264_nvenc'
    )
    expect(resolver.calls[0].encoder).toBe('h264_nvenc')
  })

  it('honors config.audioBitrate for the aac stream', async () => {
    const builder = new FFmpegArgsBuilder(makeFakeResolver())
    const args = await builder.buildRecordArgs(
      baseRecordConfig({ audioBitrate: 320 }),
      'libx264'
    )
    expect(valuesAfter(args, '-b:a')).toEqual(['320k'])
    expect(args.join(' ')).toContain('-c:a aac')
  })

  it('defaults the audio bitrate to 192k when unset', async () => {
    const builder = new FFmpegArgsBuilder(makeFakeResolver())
    const args = await builder.buildRecordArgs(baseRecordConfig(), 'libx264')
    expect(valuesAfter(args, '-b:a')).toEqual(['192k'])
  })

  it('prefers an explicit valid encoder over the detected best encoder', async () => {
    const resolver = makeFakeResolver()
    const builder = new FFmpegArgsBuilder(resolver)
    await builder.buildRecordArgs(
      baseRecordConfig({ inputFormat: 'mjpeg', codec: 'h264', encoder: 'h264_qsv' }),
      'libx264'
    )
    // explicit h264 encoder is honored for an h264 recording
    expect(resolver.calls[0].encoder).toBe('h264_qsv')
  })
})
