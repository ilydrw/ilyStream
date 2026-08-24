import { IconHeart, IconPlayerPlay, IconSend } from '@tabler/icons-react'
import type { SoundFile } from '../../hooks/useSoundboard'
import { Toggle } from './AlertRuleSection'
import type { EventSoundSettingKey, EventSoundSettings } from './types'

interface LikeMilestoneAlertSectionProps {
  settings: EventSoundSettings
  sounds: SoundFile[]
  onUpdate: (key: EventSoundSettingKey, value: EventSoundSettings[EventSoundSettingKey]) => void
}

export function LikeMilestoneAlertSection({
  settings,
  sounds,
  onUpdate
}: LikeMilestoneAlertSectionProps) {
  const enabled = settings.eventLikeMilestoneEnabled
  const repeatEnabled = settings.eventLikeMilestoneRepeatEnabled
  const soundId = settings.eventLikeMilestoneFallbackSoundId
  const volumePercent = Math.round(settings.eventLikeMilestoneFallbackVolume * 100)
  const selectedSound = sounds.find((sound) => sound.id === soundId)

  const simulate = () => {
    void window.api?.events?.simulate?.({
      platform: 'tiktok',
      type: 'like',
      username: 'milestone_viewer',
      displayName: 'Milestone Viewer',
      likeCount: 10_000,
      totalLikes: 10_000
    })
  }

  return (
    <section className="app-section-card glass !overflow-visible">
      <div className="app-section-head">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#fe2c55]/25 bg-[#fe2c55]/10">
            <IconHeart size={17} className="text-[#fe2c55]" />
          </div>
          <div className="min-w-0">
            <h2>TikTok 10K like milestone</h2>
            <p>Thank a viewer when their accepted session likes cross 10,000.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={simulate}
            disabled={!enabled}
            className="app-button !h-9 !text-[11px] disabled:opacity-35"
          >
            <IconSend size={13} />
            Test
          </button>
          <button
            type="button"
            onClick={() => onUpdate('eventLikeMilestoneEnabled', !enabled)}
            className="flex items-center gap-2 text-[11px] font-semibold text-white/55"
          >
            {enabled ? 'Enabled' : 'Disabled'}
            <Toggle value={enabled} />
          </button>
        </div>
      </div>

      <div className="grid gap-5 border-t border-white/[0.05] p-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="block text-[10px] font-semibold text-white/35">Thank-you message</span>
            <input
              value={settings.eventLikeMilestoneTemplate}
              disabled={!enabled}
              onChange={(event) => onUpdate('eventLikeMilestoneTemplate', event.target.value)}
              className="app-input !h-11 w-full !px-3 !text-xs disabled:opacity-35"
              placeholder="{displayName}, thank you for {milestoneLikes} likes!"
            />
            <span className="block text-[10px] leading-relaxed text-white/30">
              Placeholders: {'{displayName}'}, {'{username}'}, {'{milestoneLikes}'}, or {'{likes}'}.
            </span>
          </label>

          <button
            type="button"
            disabled={!enabled}
            onClick={() => onUpdate('eventLikeMilestoneRepeatEnabled', !repeatEnabled)}
            className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-35"
          >
            <span>
              <span className="block text-xs font-semibold text-white/70">Repeat every 10,000 likes</span>
              <span className="mt-1 block text-[10px] text-white/35">Fire again at 20K, 30K, 40K, and beyond.</span>
            </span>
            <Toggle value={repeatEnabled} />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="block text-[10px] font-semibold text-white/35">Default fallback sound</span>
            <div className="flex gap-2">
              <select
                value={soundId}
                disabled={!enabled}
                onChange={(event) => onUpdate('eventLikeMilestoneFallbackSoundId', event.target.value)}
                className="app-input !h-11 min-w-0 flex-1 !px-3 !text-xs disabled:opacity-35"
              >
                <option value="">No fallback sound</option>
                {sounds.map((sound) => (
                  <option key={sound.id} value={sound.id}>
                    {(sound.emoji ? `${sound.emoji} ` : '') + sound.name.replace(/\.[^/.]+$/, '')}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => soundId && window.api?.sound?.play?.(soundId, settings.eventLikeMilestoneFallbackVolume)}
                disabled={!enabled || !soundId}
                className="app-button !h-11 !w-11 !p-0 disabled:opacity-30"
                title="Preview fallback sound"
              >
                <IconPlayerPlay size={14} className="fill-current" />
              </button>
            </div>
            <span className="block text-[10px] leading-relaxed text-white/30">
              A viewer's enabled intro sound takes priority. This sound is used only when they do not have one.
            </span>
            {selectedSound && <span className="block truncate text-[10px] text-white/25">{selectedSound.name}</span>}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-2">
              <span className="block text-[10px] font-semibold text-white/35">Fallback volume · {volumePercent}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={volumePercent}
                disabled={!enabled}
                onChange={(event) => onUpdate('eventLikeMilestoneFallbackVolume', Number(event.target.value) / 100)}
                className="studio-range disabled:opacity-35"
              />
            </label>
            <label className="block space-y-2">
              <span className="block text-[10px] font-semibold text-white/35">On-screen duration</span>
              <div className="relative">
                <input
                  type="number"
                  min={1000}
                  max={30000}
                  step={500}
                  value={settings.eventLikeMilestoneDurationMs}
                  disabled={!enabled}
                  onChange={(event) => onUpdate('eventLikeMilestoneDurationMs', Number(event.target.value))}
                  className="app-input !h-11 w-full !px-3 !pr-9 !text-xs disabled:opacity-35"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-white/25">ms</span>
              </div>
            </label>
          </div>
        </div>
      </div>
    </section>
  )
}
