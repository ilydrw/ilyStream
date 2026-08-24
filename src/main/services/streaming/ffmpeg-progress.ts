const FFMPEG_PROGRESS_KEY = /^(?:frame|fps|stream_\d+_\d+_q|bitrate|total_size|out_time_us|out_time_ms|out_time|dup_frames|drop_frames|speed|progress)=/
const PROGRESS_END = /^progress=(?:continue|end)$/

export interface FfmpegProgressScan {
  buffer: string
  connected: boolean
  diagnosticText: string
}

/**
 * FFmpeg's progress protocol is machine-readable and may be split across
 * stderr chunks. A completed block only proves output after it reports at
 * least one frame, byte, or positive output timestamp; FFmpeg can emit an
 * initial all-zero block before the muxer has written anything.
 */
export function scanFfmpegProgress(previous: string, chunk: string): FfmpegProgressScan {
  const combined = `${previous}${chunk}`
  const lines = combined.split('\n')
  const partialLine = combined.endsWith('\n') ? '' : (lines.pop() ?? '')
  const progressBlock: string[] = []
  const diagnosticLines: string[] = []
  let connected = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    const trimmed = line.trim()
    if (!trimmed) continue

    if (!FFMPEG_PROGRESS_KEY.test(trimmed)) {
      diagnosticLines.push(line)
      continue
    }

    progressBlock.push(trimmed)
    if (!PROGRESS_END.test(trimmed)) continue

    connected ||= progressBlock.some(hasPositiveOutputEvidence)
    progressBlock.length = 0
  }

  const retained = [...progressBlock, partialLine].filter(Boolean).join('\n').slice(-8192)

  return {
    buffer: retained,
    connected,
    diagnosticText: diagnosticLines.join('\n')
  }
}

function hasPositiveOutputEvidence(line: string): boolean {
  const separator = line.indexOf('=')
  if (separator < 0) return false

  const key = line.slice(0, separator)
  const value = line.slice(separator + 1)
  if (key === 'frame' || key === 'total_size' || key === 'out_time_us' || key === 'out_time_ms') {
    const numericValue = Number(value)
    return Number.isFinite(numericValue) && numericValue > 0
  }

  if (key !== 'out_time') return false
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value)
  if (!match) return false

  return Number(match[1]) > 0 || Number(match[2]) > 0 || Number(match[3]) > 0
}
