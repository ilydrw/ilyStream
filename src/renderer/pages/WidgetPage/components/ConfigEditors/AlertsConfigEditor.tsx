import { useMemo } from 'react'
import {
  DEFAULT_ALERTS_CONFIG,
  type AlertsConfig,
  type Widget
} from '../../../../../shared/widgets'
import { EditorNote } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

/**
 * The alerts widget is a frame: WHAT each alert says, its colors, sound, and
 * entrance animation are configured per event type (follow, sub, gift, raid,
 * superfan…) in Settings → Alerts, because they are shared with the sound
 * engine and TTS. This editor only owns the shell the alerts render inside —
 * the previous version showed accent/text/duration controls the overlay
 * template never read.
 */
export function AlertsConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<AlertsConfig>(
    () => ({ ...DEFAULT_ALERTS_CONFIG, ...(draft.config as Partial<AlertsConfig>) }),
    [draft.config]
  )

  const update = (key: string, value: unknown) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <EditorNote>
        Per-event alert content — messages, colors, sounds, durations, and animations for
        follows, subs, gifts, and raids — lives in{' '}
        <span className="text-white/80 font-semibold">Settings → Alerts</span>, where it is
        shared with alert sounds and TTS. This page styles the card those alerts render
        inside.
      </EditorNote>

      <DesignSystemSection
        config={config}
        onUpdate={update}
        features={{ font: true, radius: true, glass: true, animation: false }}
      />
    </div>
  )
}
