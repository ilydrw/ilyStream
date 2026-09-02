import type { NativeCoreDiagnostics } from '../../shared/native-core-diagnostics'

export function describeNativeCoreHealth(snapshot: NativeCoreDiagnostics | null, now = Date.now()) {
  const state = (label: string, detail: string, tone: 'idle' | 'warning' | 'good' = 'idle') => ({ label, detail, tone })
  if (!snapshot) return state('Unavailable', 'Native diagnostics are not available. Encoder routing is unchanged.')
  if (now - snapshot.sampledAt > 10_000) return state('Stale snapshot', 'Diagnostics have not refreshed recently. Do not use these results as current evidence.', 'warning')
  if (!snapshot.host.enabled) return state('Disabled', 'The native host is opt-in. This panel does not change encoder routing.')
  if (!snapshot.host.running || snapshot.host.failed || snapshot.collectionError === 'host-unavailable') {
    return state('Host unavailable', 'The native host did not respond. Check the application log; this panel never switches encoder input.', 'warning')
  }
  if (snapshot.disabledReason === 'capture-conflict') {
    return state('Capture conflict', 'ILY_NATIVE_AUDIO=1 conflicts with the single shared reader used for mixer shadow audio. Disable it before testing.', 'warning')
  }
  if (snapshot.collectionError) return state('Diagnostics incomplete', 'The transport could not be sampled or the session changed. Waiting for a fresh snapshot.', 'warning')
  if (snapshot.policy.mismatches || snapshot.policy.rejected) {
    return state('Policy needs review', 'Routing-policy mismatches or rejected snapshots were observed during this app session.', 'warning')
  }
  if (!snapshot.audio.enabled) return state('Audio shadow disabled', 'The host is available; enable the audio-shadow flag to compare Program PCM.')
  const audio = snapshot.audio
  if (audio.failed) return state('Shadow failed', 'The shadow session could not start. Check the application log before testing again.', 'warning')
  if (audio.mismatches || audio.rejected || audio.droppedComparisons ||
      snapshot.transport?.sourceUnderruns || snapshot.transport?.sourceFramesSkipped) {
    return state('Audio needs review', 'This audio session contains mismatches, rejected blocks, dropped comparisons, or transport gaps.', 'warning')
  }
  if (!audio.active) return state(audio.startedAt === null ? 'Waiting for audio' : 'Session stopped',
    'Start a 48 kHz Broadcast Studio output with at least one source to collect a new shadow session.')
  if (!snapshot.transport?.running) return state('Transport unavailable', 'Audio shadow is active but its native transport is not confirmed running.', 'warning')
  if (audio.startedAt === null || now - (audio.lastComparedAt ?? audio.startedAt) > 10_000) {
    return state('No comparison progress', 'No recent matched block pairs are arriving. Check source activity and transport health.', 'warning')
  }
  if (!audio.comparedBlocks) return state('Collecting', 'Waiting for the first paired native and renderer audio blocks.')
  return state('Matching so far', 'Observed PCM blocks match within 0.0001. This is shadow evidence, not encoder-cutover approval.', 'good')
}

/** Self-scheduling: never overlap requests or deliver results after unmount. */
export function pollNativeCoreDiagnostics(
  read: () => Promise<NativeCoreDiagnostics | null>,
  onSnapshot: (value: NativeCoreDiagnostics | null) => void
): () => void {
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const poll = async () => {
    try {
      const value = await read()
      if (!disposed) onSnapshot(value)
    } catch {
      if (!disposed) onSnapshot(null)
    } finally {
      if (!disposed) timer = setTimeout(() => { void poll() }, 2_000)
    }
  }
  void poll()
  return () => { disposed = true; clearTimeout(timer) }
}
