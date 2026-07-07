import { useMemo } from 'react'
import {
  DEFAULT_LEADERBOARD_CONFIG,
  type LeaderboardConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, ColorRow, EditorNote } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

// The template also reads secondaryColor (row accents / rank fade), which the
// shared config type never picked up.
type LeaderboardEditorConfig = LeaderboardConfig & { secondaryColor?: string }

export function LeaderboardConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<LeaderboardEditorConfig>(
    () => ({ ...DEFAULT_LEADERBOARD_CONFIG, ...(draft.config as Partial<LeaderboardEditorConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof LeaderboardEditorConfig>(key: K, value: LeaderboardEditorConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <EditorNote>
        Ranks the stream's top gifters live — rows appear and reorder as gifts come in, and
        reset when a new stream starts. There is nothing to pre-fill here; style it and drop
        it in a scene.
      </EditorNote>

      <Section label="Colors">
        <ColorRow
          label="Accent"
          hint="Rank numbers, the leader highlight, and value text."
          value={config.accentColor}
          onChange={(v) => update('accentColor', v)}
        />
        <ColorRow
          label="Secondary"
          hint="Row accents behind lower ranks."
          value={config.secondaryColor || '#d035f1'}
          onChange={(v) => update('secondaryColor', v)}
        />
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update as (key: string, value: unknown) => void}
        features={{ font: true, radius: true, glass: true, animation: true }}
      />
    </div>
  )
}
