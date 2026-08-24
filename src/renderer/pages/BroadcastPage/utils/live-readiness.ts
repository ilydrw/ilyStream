import type { MediaSourceStatus } from './media-init'

export type LiveReadinessTone = 'ready' | 'warning' | 'blocked' | 'checking'

export interface LiveReadinessCheck {
  id: 'destination' | 'scene' | 'media' | 'audio' | 'encoder' | 'storage' | 'network' | 'outputs'
  label: string
  summary: string
  detail: string
  tone: LiveReadinessTone
  blocksGoLive: boolean
}

export interface LiveReadinessReport {
  generatedAt: number
  tone: Exclude<LiveReadinessTone, 'checking'>
  checks: LiveReadinessCheck[]
  blockerCount: number
  warningCount: number
  checkingCount: number
  readyCount: number
}

export interface LiveReadinessSystemSnapshot {
  checkedAt: number
  ffmpegAvailable: boolean
  encoder: string | null
  encoderKind: 'hardware' | 'software' | null
  recordingWritable: boolean
  recordingFreeBytes: number | null
  error?: string
}

export interface LiveReadinessOutput {
  id: string
  name: string
  state: string
  degraded: boolean
  droppedVideoChunks?: number
  droppedAudioChunks?: number
  retries?: number
  bitrateScale?: number
  lastError?: string
}

export interface LiveReadinessIncident {
  id: string
  outputId: string
  outputName: string
  kind: 'started' | 'reconnecting' | 'recovered' | 'failed' | 'stopped'
  at: number
  message: string
  retry?: number
}

export interface BuildLiveReadinessInput {
  now?: number
  destinationNames: string[]
  hasIncompleteCustomDestination: boolean
  missingDestinationNames?: string[]
  duplicateDestinationNames?: string[]
  sceneName: string
  visibleVisualLayerCount: number
  mediaSources: Array<{
    id: string
    name: string
    status?: MediaSourceStatus
  }>
  hasAudioRoute: boolean
  hasConfiguredAudio: boolean
  masterMuted: boolean
  audioContextState?: AudioContextState
  online: boolean
  system?: LiveReadinessSystemSnapshot | null
  isStreaming?: boolean
  outputs?: LiveReadinessOutput[]
  incidents?: LiveReadinessIncident[]
}

const DEFINITE_MEDIA_FAILURES = new Set<MediaSourceStatus['code']>([
  'device-busy',
  'permission-denied',
  'unsupported-settings',
  'device-missing',
  'error'
])

const MIN_RECORDING_FREE_BYTES = 2 * 1024 * 1024 * 1024

export function buildLiveReadinessReport(input: BuildLiveReadinessInput): LiveReadinessReport {
  const checks = [
    buildDestinationCheck(input),
    buildSceneCheck(input),
    buildMediaCheck(input),
    buildAudioCheck(input),
    buildEncoderCheck(input),
    buildStorageCheck(input),
    buildNetworkCheck(input),
    buildOutputCheck(input)
  ]

  const blockerCount = checks.filter(check => check.blocksGoLive && check.tone === 'blocked').length
  const warningCount = checks.filter(check => check.tone === 'warning' || (check.tone === 'blocked' && !check.blocksGoLive)).length
  const checkingCount = checks.filter(check => check.tone === 'checking').length
  const readyCount = checks.filter(check => check.tone === 'ready').length

  return {
    generatedAt: input.now ?? Date.now(),
    tone: blockerCount > 0 ? 'blocked' : warningCount > 0 || checkingCount > 0 ? 'warning' : 'ready',
    checks,
    blockerCount,
    warningCount,
    checkingCount,
    readyCount
  }
}

export function createLiveReadinessDiagnosticReport(
  report: LiveReadinessReport,
  context: {
    sceneName: string
    destinationNames: string[]
    system?: LiveReadinessSystemSnapshot | null
    outputs?: LiveReadinessOutput[]
    incidents?: LiveReadinessIncident[]
    resourceUsage?: { cpuPercent: number; memoryMB: number; processCount: number } | null
  }
): string {
  return JSON.stringify({
    generatedAt: new Date(report.generatedAt).toISOString(),
    app: 'ilyStream',
    area: 'broadcast-live-readiness',
    overall: report.tone,
    blockers: report.blockerCount,
    warnings: report.warningCount,
    scene: context.sceneName,
    destinations: context.destinationNames,
    checks: report.checks.map(check => ({
      id: check.id,
      status: check.tone,
      blocksGoLive: check.blocksGoLive,
      summary: check.summary,
      detail: check.detail
    })),
    system: context.system
      ? {
          checkedAt: new Date(context.system.checkedAt).toISOString(),
          ffmpegAvailable: context.system.ffmpegAvailable,
          encoder: context.system.encoder,
          encoderKind: context.system.encoderKind,
          recordingWritable: context.system.recordingWritable,
          recordingFreeBytes: context.system.recordingFreeBytes,
          error: context.system.error
        }
      : null,
    resources: context.resourceUsage ?? null,
    outputs: (context.outputs ?? []).map(output => ({
      id: output.id,
      name: output.name,
      state: output.state,
      degraded: output.degraded,
      droppedVideoChunks: output.droppedVideoChunks ?? 0,
      droppedAudioChunks: output.droppedAudioChunks ?? 0,
      retries: output.retries ?? 0,
      bitrateScale: output.bitrateScale ?? 1,
      lastError: output.lastError
    })),
    incidents: (context.incidents ?? []).map(incident => ({
      id: incident.id,
      outputId: incident.outputId,
      outputName: incident.outputName,
      kind: incident.kind,
      at: new Date(incident.at).toISOString(),
      message: incident.message,
      retry: incident.retry
    }))
  }, null, 2)
}

function buildDestinationCheck(input: BuildLiveReadinessInput): LiveReadinessCheck {
  if (input.hasIncompleteCustomDestination) {
    return check('destination', 'Destination', 'Custom RTMP setup is incomplete',
      'Enter both the RTMP server URL and stream key before going live.', 'blocked', true)
  }
  if ((input.duplicateDestinationNames ?? []).length > 0) {
    return check('destination', 'Destination', 'A destination is assigned to multiple layouts',
      `Choose one layout for: ${input.duplicateDestinationNames!.join(', ')}. Two encoders cannot publish to the same stream key at once.`, 'blocked', true)
  }
  if ((input.missingDestinationNames ?? []).length > 0) {
    return check('destination', 'Destination', 'A saved destination is no longer available',
      `Reconnect or remove: ${input.missingDestinationNames!.join(', ')}.`, 'blocked', true)
  }
  if (input.destinationNames.length === 0) {
    return check('destination', 'Destination', 'Choose where to stream',
      'Assign at least one configured platform or a complete custom RTMP destination.', 'blocked', true)
  }
  return check('destination', 'Destination',
    `${input.destinationNames.length} destination${input.destinationNames.length === 1 ? '' : 's'} selected`,
    input.destinationNames.join(', '), 'ready', false)
}

function buildSceneCheck(input: BuildLiveReadinessInput): LiveReadinessCheck {
  if (input.visibleVisualLayerCount === 0) {
    return check('scene', 'Program scene', 'The program scene has no visible picture',
      `"${input.sceneName}" needs at least one visible camera, display, image, text, browser, or widget layer.`, 'blocked', true)
  }
  return check('scene', 'Program scene', `"${input.sceneName}" has a visible program picture`,
    `${input.visibleVisualLayerCount} visual layer${input.visibleVisualLayerCount === 1 ? '' : 's'} will be composited.`, 'ready', false)
}

function buildMediaCheck(input: BuildLiveReadinessInput): LiveReadinessCheck {
  if (input.mediaSources.length === 0) {
    return check('media', 'Capture sources', 'No camera or display capture is required',
      'The current scene can run from static, browser, or widget layers.', 'ready', false)
  }

  const failures = input.mediaSources.filter(source => source.status && DEFINITE_MEDIA_FAILURES.has(source.status.code))
  if (failures.length > 0) {
    return check('media', 'Capture sources', `${failures.length} source${failures.length === 1 ? '' : 's'} failed`,
      failures.map(source => `${source.name}: ${source.status?.label}`).join(' · '), 'blocked', true)
  }

  const pending = input.mediaSources.filter(source =>
    !source.status || source.status.code === 'opening' || source.status.code === 'retrying'
  )
  if (pending.length > 0) {
    return check('media', 'Capture sources', 'Capture sources are still opening',
      pending.map(source => source.name).join(', '), 'checking', false)
  }

  return check('media', 'Capture sources', 'All required capture sources are live',
    input.mediaSources.map(source => source.name).join(', '), 'ready', false)
}

function buildAudioCheck(input: BuildLiveReadinessInput): LiveReadinessCheck {
  if (input.masterMuted) {
    return check('audio', 'Broadcast audio', 'The master mix is muted',
      'Video can go live, but the broadcast mix will be silent until the master is unmuted.', 'warning', false)
  }
  if (!input.hasConfiguredAudio) {
    return check('audio', 'Broadcast audio', 'No microphone or capture audio is configured',
      'ilyStream will provide a valid silent audio track so the encoder can still start.', 'warning', false)
  }
  if (!input.hasAudioRoute || input.audioContextState === 'closed') {
    return check('audio', 'Broadcast audio', 'The mixer route is still initializing',
      'Wait for the audio mixer to finish attaching before going live.', 'checking', false)
  }
  if (input.audioContextState === 'suspended') {
    return check('audio', 'Broadcast audio', 'Audio will resume when Go Live is pressed',
      'The browser suspended the audio context while idle; ilyStream resumes it during startup.', 'warning', false)
  }
  return check('audio', 'Broadcast audio', 'The broadcast mix is routed',
    'The live encoder will receive the Studio master mix.', 'ready', false)
}

function buildEncoderCheck(input: BuildLiveReadinessInput): LiveReadinessCheck {
  const system = input.system
  if (!system) {
    return check('encoder', 'Encoder', 'Checking the local encoder',
      'ilyStream is probing the bundled FFmpeg and available H.264 encoders.', 'checking', false)
  }
  if (!system.ffmpegAvailable || !system.encoder) {
    return check('encoder', 'Encoder', 'No working H.264 encoder is available',
      system.error || 'Repair the installation or graphics driver, then refresh readiness.', 'blocked', true)
  }
  if (system.encoderKind === 'software') {
    return check('encoder', 'Encoder', `${system.encoder} software encoding is available`,
      'Streaming can start, but high resolutions may use significant CPU. A supported hardware encoder is preferred.', 'warning', false)
  }
  return check('encoder', 'Encoder', `${system.encoder} hardware encoding is ready`,
    'The bundled FFmpeg probe completed successfully.', 'ready', false)
}

function buildStorageCheck(input: BuildLiveReadinessInput): LiveReadinessCheck {
  const system = input.system
  if (!system) {
    return check('storage', 'Recording storage', 'Checking the recording folder',
      'This does not block streaming.', 'checking', false)
  }
  if (!system.recordingWritable) {
    return check('storage', 'Recording storage', 'The recording folder is not writable',
      'Streaming can continue, but recording will fail until the folder is fixed.', 'warning', false)
  }
  if (system.recordingFreeBytes !== null && system.recordingFreeBytes < MIN_RECORDING_FREE_BYTES) {
    return check('storage', 'Recording storage', 'Recording space is running low',
      `${formatBytes(system.recordingFreeBytes)} free. Keep at least 2 GB free before recording.`, 'warning', false)
  }
  return check('storage', 'Recording storage', 'The recording folder is writable',
    system.recordingFreeBytes === null ? 'Free space could not be measured.' : `${formatBytes(system.recordingFreeBytes)} free.`, 'ready', false)
}

function buildNetworkCheck(input: BuildLiveReadinessInput): LiveReadinessCheck {
  if (!input.online) {
    return check('network', 'Network', 'Windows reports that this device is offline',
      'The OS signal can be wrong with VPNs or virtual adapters, so ilyStream will still let you try the RTMP connection.', 'warning', false)
  }
  return check('network', 'Network', 'A network connection is available',
    'The final RTMP connection is verified when each destination starts.', 'ready', false)
}

function buildOutputCheck(input: BuildLiveReadinessInput): LiveReadinessCheck {
  if (!input.isStreaming) {
    return check('outputs', 'Live outputs', 'No output is active yet',
      'Destination reconnects and dropped frames will appear here during the broadcast.', 'ready', false)
  }

  const latestIncidentByOutput = new Map<string, LiveReadinessIncident>()
  for (const incident of input.incidents ?? []) latestIncidentByOutput.set(incident.outputId, incident)
  const selectedDestinations = new Set(input.destinationNames)
  const terminalFailures = Array.from(latestIncidentByOutput.values()).filter(incident =>
    incident.kind === 'failed' && selectedDestinations.has(incident.outputName)
  )
  if (terminalFailures.length > 0) {
    return check('outputs', 'Live outputs',
      `${terminalFailures.length} destination${terminalFailures.length === 1 ? '' : 's'} stopped after reconnect attempts`,
      terminalFailures.map(incident => `${incident.outputName}: ${incident.message}`).join(' · '),
      'blocked', false)
  }

  const outputs = input.outputs ?? []
  const starting = outputs.filter(output => output.state === 'starting')
  if (starting.length > 0 || outputs.length === 0) {
    return check('outputs', 'Live outputs', 'Connecting to destination ingest',
      'ilyStream is waiting for the first confirmed output packets before reporting Live.', 'checking', false)
  }
  const failed = outputs.filter(output => output.state === 'error' || output.state === 'reconnecting')
  if (failed.length > 0) {
    return check('outputs', 'Live outputs', `${failed.length} output${failed.length === 1 ? '' : 's'} need attention`,
      failed.map(output => `${output.name}: ${output.lastError || output.state}`).join(' · '), 'blocked', false)
  }
  const degraded = outputs.filter(output => output.degraded)
  if (degraded.length > 0) {
    return check('outputs', 'Live outputs', `${degraded.length} output${degraded.length === 1 ? '' : 's'} are dropping frames`,
      degraded.map(output => output.name).join(', '), 'warning', false)
  }
  return check('outputs', 'Live outputs', `${outputs.length} output${outputs.length === 1 ? '' : 's'} live`,
    'No current reconnects or newly dropped chunks were reported.', 'ready', false)
}

function check(
  id: LiveReadinessCheck['id'],
  label: string,
  summary: string,
  detail: string,
  tone: LiveReadinessTone,
  blocksGoLive: boolean
): LiveReadinessCheck {
  return { id, label, summary, detail, tone, blocksGoLive }
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`
  return `${Math.max(0, Math.round(bytes / (1024 * 1024)))} MB`
}
