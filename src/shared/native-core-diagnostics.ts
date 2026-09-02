/** Read-only diagnostics: never include mapping names, credentials, or local paths. */
export interface NativeMixerTransportDiagnostics {
  running: boolean
  blocksMixed: number
  framesMixed: number
  sourceUnderruns: number
  sourceFramesSkipped: number
}

export interface NativeCoreDiagnostics {
  sampledAt: number
  mixerOutput: 'shadow-only'
  host: { enabled: boolean; running: boolean; failed: boolean }
  collectionError: 'host-unavailable' | 'transport-unavailable' | 'session-changed' | null
  disabledReason: 'host-disabled' | 'audio-disabled' | 'capture-conflict' | null
  policy: { evaluated: number; mismatches: number; rejected: number; coalesced: number }
  audio: {
    enabled: boolean
    active: boolean
    failed: boolean
    startedAt: number | null
    lastComparedAt: number | null
    sourceCount: number
    sourceFrames: number
    nativeFrames: number
    comparedBlocks: number
    mismatches: number
    rejected: number
    droppedComparisons: number
    maxError: number
  }
  transport: NativeMixerTransportDiagnostics | null
}
