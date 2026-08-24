import { useMemo } from 'react'
import {
  DEFAULT_ALERTS_CONFIG,
  type AlertsConfig,
  type Widget
} from '../../../../../shared/widgets'
import { EditorNote } from './Shared'
import { Section, Slider } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

/**
 * The alerts widget is only the FRAME alerts render inside. Everything about
 * how an individual alert looks — card background and opacity, border, text,
 * image, layout, position — lives on the Alert Routes page, per route, where
 * it always wins over widget-level values. Duplicating those controls here
 * made the two pages fight (route styles silently override), so this editor
 * deliberately owns just the pieces routes can't set: font, corner rounding
 * default, and the frosted-glass blur strength.
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
        Each alert&apos;s look — card color and opacity, border, text, image, layout,
        and position — is styled per route in{' '}
        <span className="text-white/80 font-semibold">Create → Alert Routes</span> (Style tab),
        and those settings always win. This page only sets the shared frame below.
      </EditorNote>

      <Section label="Frame">
        <Slider
          label="Frosted-glass blur"
          hint="Blur of whatever is behind the card. Fades away automatically as a route's background opacity approaches 0."
          value={config.blur}
          min={0}
          max={120}
          unit="px"
          onChange={(v) => update('blur', v)}
        />
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update}
        features={{ font: true, radius: true, glass: false, animation: false }}
      />
    </div>
  )
}
