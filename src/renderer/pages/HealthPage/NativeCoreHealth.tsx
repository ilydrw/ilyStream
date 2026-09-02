import React from 'react'
import type { NativeCoreDiagnostics } from '../../../shared/native-core-diagnostics'
import { describeNativeCoreHealth } from '../../lib/native-core-health'

export function NativeCoreHealth({ snapshot }: { snapshot: NativeCoreDiagnostics | null }) {
  const summary = describeNativeCoreHealth(snapshot)
  const audio = snapshot?.audio
  const count = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString()
  const metrics = [
    ['Sources', count(audio?.sourceCount)],
    ['Compared blocks', count(audio?.comparedBlocks)],
    ['PCM mismatches', count(audio?.mismatches)],
    ['Max sample error', audio ? audio.maxError.toExponential(2) : '—'],
    ['Dropped comparisons', count(audio?.droppedComparisons)],
    ['Rejected blocks / configs', count(audio?.rejected)],
    ['Source underruns', count(snapshot?.transport?.sourceUnderruns)],
    ['Source frames skipped', count(snapshot?.transport?.sourceFramesSkipped)],
    ['Native frames mixed', count(snapshot?.transport?.framesMixed)],
    ['Policy evaluations', count(snapshot?.policy.evaluated)],
    ['Policy mismatches', count(snapshot?.policy.mismatches)],
    ['Policy rejections', count(snapshot?.policy.rejected)]
  ]
  return (
    <section className="app-section-card glass health-native" aria-labelledby="native-core-heading">
      <div className="app-section-head">
        <div>
          <h2 id="native-core-heading">Native mixer validation</h2>
          <p>Shadow comparison only · does not switch encoder input</p>
        </div>
        <span className={`app-status-chip ${summary.tone === 'idle' ? '' : `is-${summary.tone}`}`}>
          {summary.label}
        </span>
      </div>
      <div className="app-section-content">
        <p className="health-native-detail" role="status">{summary.detail}</p>
        {snapshot?.host.enabled && (
          <>
            <dl className="health-native-metrics">
              {metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            <p className="health-native-detail">
              Audio counters cover the current or last audio session; policy counters cover this app session.
              {audio?.startedAt != null && ` Audio session started ${new Date(audio.startedAt).toLocaleTimeString()}.`}
              {` Snapshot ${new Date(snapshot.sampledAt).toLocaleTimeString()}.`}
              {' Missing transport values are unknown, not zero. Live-device soak testing is still required.'}
            </p>
          </>
        )}
        <details className="health-native-setup">
          <summary>Development test setup</summary>
          <p>Launch a development build with both flags below, then start a local 48 kHz Broadcast Studio recording with at least one audio source. Do not test with a live audience.</p>
          <pre>ILYSTREAM_NATIVE_CORE_HOST=1{'\n'}ILYSTREAM_NATIVE_MIXER_AUDIO_SHADOW=1</pre>
          <p>Leave <code>ILY_NATIVE_AUDIO</code> unset. This temporary bridge has one shared reader. The native snapshot in Copy report excludes mapping names, paths, and credentials.</p>
        </details>
      </div>
    </section>
  )
}
