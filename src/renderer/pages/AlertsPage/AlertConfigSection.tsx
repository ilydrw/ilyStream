import { Image, Play, Send, Type, Upload, Volume2, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AssetFile } from '../../hooks/useAssets'
import { SoundFile } from '../../hooks/useSoundboard'
import { AlertKind, EventSoundSettingKey, EventSoundSettings } from './types'

interface AlertConfigSectionProps {
  title: string
  icon: LucideIcon
  type: AlertKind
  settings: EventSoundSettings
  sounds: SoundFile[]
  images: AssetFile[]
  onUpdate: (key: EventSoundSettingKey, value: EventSoundSettings[EventSoundSettingKey]) => void
  onUploadSound?: () => void
  onUploadImage?: () => void
}

const LAYOUT_OPTIONS = [
  { value: 'stacked', label: 'Stacked' },
  { value: 'side-by-side', label: 'Side by Side' },
  { value: 'text-only', label: 'Text Only' },
  { value: 'image-only', label: 'Image Only' }
]

const ANIMATION_IN_OPTIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'zoom', label: 'Zoom' }
]

const ANIMATION_OUT_OPTIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'tv-warp', label: 'TV Warp' }
]

export function AlertConfigSection({
  title,
  icon: Icon,
  type,
  settings,
  sounds,
  images,
  onUpdate,
  onUploadSound,
  onUploadImage
}: AlertConfigSectionProps) {
  const audioEnabled = getSetting<boolean>(settings, `eventSound${type}Enabled`)
  const visualEnabled = getSetting<boolean>(settings, `eventImage${type}Enabled`)
  const textEnabled = getSetting<boolean>(settings, `eventText${type}Enabled`)
  const soundId = getSetting<string>(settings, `eventSound${type}SoundId`)
  const imageId = getSetting<string>(settings, `eventImage${type}AssetId`)
  const volume = Math.round((getSetting<number>(settings, `eventSound${type}Volume`) || 0) * 100)
  const fontSize = getSetting<number>(settings, `eventText${type}FontSize`) || 44
  const textColor = getSetting<string>(settings, `eventText${type}Color`) || '#ffffff'
  const backgroundColor = normalizeColorInput(getSetting<string>(settings, `eventText${type}BackgroundColor`), '#000000')
  const borderColor = getSetting<string>(settings, `eventText${type}BorderColor`)

  const selectedSound = sounds.find((sound) => sound.id === soundId)
  const selectedImage = images.find((image) => image.id === imageId)

  const update = (key: EventSoundSettingKey, value: EventSoundSettings[EventSoundSettingKey]) => {
    onUpdate(key, value)
  }

  const playCurrentSound = (ignoreEnabled = false) => {
    if ((!audioEnabled && !ignoreEnabled) || !soundId) return
    void window.api?.sound?.play?.(soundId, volume / 100)
  }

  const simulate = () => {
    playCurrentSound(true)
    void window.api?.events?.simulate?.({
      type: (type === 'Superfan' ? 'superfan' : type.toLowerCase()) as any,
      suppressSound: true
    })
  }

  return (
    <section className="app-section-card glass !p-0 overflow-hidden">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <Icon size={32} />
          </div>
          <div>
            <h2>{title}</h2>
            <p>{type === 'Superfan' ? 'Subscriber and fan-club alert' : `${type} alert`}</p>
          </div>
        </div>
        <button onClick={simulate} className="app-button !h-10 !px-5 !text-[10px] font-black tracking-widest">
          <Send size={13} />
          Test
        </button>
      </div>

      <div className="app-section-content !p-0">
        <div className="grid grid-cols-1 divide-y divide-white/[0.04] xl:grid-cols-3 xl:divide-x xl:divide-y-0">
          <Panel icon={Volume2} title="Audio" active={audioEnabled}>
            <ToggleLine
              label="Play sound"
              value={audioEnabled}
              onChange={(value) => update(`eventSound${type}Enabled` as EventSoundSettingKey, value)}
            />

            <Field label="Alert sound">
              <div className="flex gap-2">
                <select
                  value={soundId || ''}
                  disabled={!audioEnabled}
                  onChange={(event) => update(`eventSound${type}SoundId` as EventSoundSettingKey, event.target.value)}
                  className="app-input !h-11 min-w-0 flex-1 !px-3 !text-xs disabled:opacity-35"
                >
                  <option value="">No sound</option>
                  {sounds.map((sound) => (
                    <option key={sound.id} value={sound.id}>
                      {(sound.emoji ? `${sound.emoji} ` : '') + sound.name.replace(/\.[^/.]+$/, '')}
                    </option>
                  ))}
                </select>
                <button
                  onClick={playCurrentSound}
                  disabled={!audioEnabled || !soundId}
                  className="app-button !h-11 !w-11 !p-0 disabled:opacity-30"
                  title="Preview sound"
                >
                  <Play size={14} className="fill-current" />
                </button>
              </div>
              {selectedSound && <p className="mt-2 truncate text-[10px] font-bold text-white/25">{selectedSound.name}</p>}
            </Field>

            <RangeField
              label="Volume"
              value={volume}
              min={0}
              max={100}
              suffix="%"
              disabled={!audioEnabled}
              onChange={(value) => update(`eventSound${type}Volume` as EventSoundSettingKey, value / 100)}
            />

            <button onClick={onUploadSound} className="app-button w-full !h-10 !text-[10px]">
              <Upload size={13} />
              Add Audio Asset
            </button>
          </Panel>

          <Panel icon={Image} title="Visual" active={visualEnabled}>
            <ToggleLine
              label="Show image"
              value={visualEnabled}
              onChange={(value) => update(`eventImage${type}Enabled` as EventSoundSettingKey, value)}
            />

            <Field label="Alert image">
              <select
                value={imageId || ''}
                disabled={!visualEnabled}
                onChange={(event) => update(`eventImage${type}AssetId` as EventSoundSettingKey, event.target.value)}
                className="app-input !h-11 w-full !px-3 !text-xs disabled:opacity-35"
              >
                <option value="">Default visual</option>
                {images.map((image) => (
                  <option key={image.id} value={image.id}>{image.name}</option>
                ))}
              </select>
              {selectedImage && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] p-2">
                  <img
                    src={`asset:///${encodeURIComponent(selectedImage.id)}`}
                    className="h-10 w-10 rounded-lg object-cover"
                    alt=""
                  />
                  <span className="min-w-0 truncate text-[10px] font-bold text-white/35">{selectedImage.name}</span>
                </div>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Layout"
                value={getSetting<string>(settings, `eventAlert${type}Layout`) || 'stacked'}
                options={LAYOUT_OPTIONS}
                onChange={(value) => update(`eventAlert${type}Layout` as EventSoundSettingKey, value)}
              />
              <NumberField
                label="Duration"
                value={getSetting<number>(settings, `eventAlert${type}DurationMs`) || 5000}
                min={500}
                max={30000}
                suffix="ms"
                onChange={(value) => update(`eventAlert${type}DurationMs` as EventSoundSettingKey, value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="In"
                value={getSetting<string>(settings, `eventAlert${type}AnimationIn`) || 'fade'}
                options={ANIMATION_IN_OPTIONS}
                onChange={(value) => update(`eventAlert${type}AnimationIn` as EventSoundSettingKey, value)}
              />
              <SelectField
                label="Out"
                value={getSetting<string>(settings, `eventAlert${type}AnimationOut`) || 'fade'}
                options={ANIMATION_OUT_OPTIONS}
                onChange={(value) => update(`eventAlert${type}AnimationOut` as EventSoundSettingKey, value)}
              />
            </div>

            <button onClick={onUploadImage} className="app-button w-full !h-10 !text-[10px]">
              <Upload size={13} />
              Add Visual Asset
            </button>
          </Panel>

          <Panel icon={Type} title="Text" active={textEnabled}>
            <ToggleLine
              label="Show message"
              value={textEnabled}
              onChange={(value) => update(`eventText${type}Enabled` as EventSoundSettingKey, value)}
            />

            <Field label="Template">
              <input
                value={getSetting<string>(settings, `eventText${type}Template`) || ''}
                disabled={!textEnabled}
                onChange={(event) => update(`eventText${type}Template` as EventSoundSettingKey, event.target.value)}
                className="app-input !h-11 w-full !px-3 !text-xs disabled:opacity-35"
                placeholder="{displayName} sent {giftCount}x {giftName}!"
              />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <ColorField
                label="Text"
                value={textColor}
                disabled={!textEnabled}
                onChange={(value) => update(`eventText${type}Color` as EventSoundSettingKey, value)}
              />
              <ColorField
                label="Panel"
                value={backgroundColor}
                disabled={!textEnabled}
                onChange={(value) => update(`eventText${type}BackgroundColor` as EventSoundSettingKey, `${value}33`)}
              />
              <Field label="Border">
                <button
                  disabled={!textEnabled}
                  onClick={() => update(`eventText${type}BorderColor` as EventSoundSettingKey, borderColor === 'gradient' ? 'transparent' : 'gradient')}
                  className={`app-button h-11 w-full !p-0 disabled:opacity-35 ${
                    borderColor === 'gradient' ? '!bg-accent/15 !text-accent !border-accent/25' : '!text-white/35'
                  }`}
                  title="Toggle gradient border"
                >
                  <Zap size={15} />
                </button>
              </Field>
            </div>

            <RangeField
              label="Font size"
              value={fontSize}
              min={16}
              max={120}
              suffix="px"
              disabled={!textEnabled}
              onChange={(value) => update(`eventText${type}FontSize` as EventSoundSettingKey, value)}
            />
          </Panel>
        </div>
      </div>
    </section>
  )
}

function Panel({
  icon: Icon,
  title,
  active,
  children
}: {
  icon: LucideIcon
  title: string
  active: boolean
  children: ReactNode
}) {
  return (
    <div className="flex min-h-[430px] flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon size={18} className={active ? 'text-accent' : 'text-white/20'} />
          <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-white/65">{title}</h3>
        </div>
        <span className={`h-2 w-2 rounded-full ${active ? 'bg-accent' : 'bg-white/10'}`} />
      </div>
      {children}
    </div>
  )
}

function ToggleLine({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex h-11 items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 text-left transition-all hover:border-white/20 hover:bg-white/[0.04]"
    >
      <span className="text-xs font-bold text-white/65">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition-all ${value ? 'bg-accent/80' : 'bg-white/10'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${value ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-white/22">{label}</span>
      {children}
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="app-input !h-11 w-full !px-3 !text-xs"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Field>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
          className="app-input !h-11 w-full !px-3 !pr-9 !text-xs"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-white/18">
          {suffix}
        </span>
      </div>
    </Field>
  )
}

function RangeField({
  label,
  value,
  min,
  max,
  suffix,
  disabled,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <Field label={`${label} ${value}${suffix}`}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="studio-range disabled:opacity-35"
      />
    </Field>
  )
}

function ColorField({
  label,
  value,
  disabled,
  onChange
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      <input
        type="color"
        value={normalizeColorInput(value, '#ffffff')}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.025] p-1 disabled:opacity-35"
      />
    </Field>
  )
}

function getSetting<T>(settings: EventSoundSettings, key: EventSoundSettingKey): T {
  return settings[key] as T
}

function normalizeColorInput(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  if (/^#[0-9a-f]{8}$/i.test(value)) return value.slice(0, 7)
  return fallback
}
