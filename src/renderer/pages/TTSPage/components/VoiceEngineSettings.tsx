import React from 'react'
import {IconAt, IconGauge, IconHeadphones, IconKey, IconShieldCheck, IconVolume, IconActivity, IconPlus, IconTrash} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import type { AppSettings } from '../../../../shared/app-settings'
import { useStudioStore } from '../../../stores/studio-store'
import { toast } from '../../../components/ui/Toast'
import { audioEngine } from '../../../utils/audio-engine'

function TtsSignalMeter() {
  const [level, setLevel] = React.useState(0)
  const lastLevel = React.useRef(0)

  React.useEffect(() => {
    const ctx = audioEngine.getContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 32
    analyser.smoothingTimeConstant = 0.3
    
    const bus = audioEngine.getTtsBus()
    bus.connect(analyser)

    const data = new Uint8Array(analyser.frequencyBinCount)
    let rafId: number

    const tick = () => {
      analyser.getByteFrequencyData(data)
      let max = 0
      for (let i = 0; i < data.length; i++) {
        if (data[i] > max) max = data[i]
      }
      
      const target = max / 255
      // Smooth the decay
      if (target > lastLevel.current) {
        lastLevel.current = target
      } else {
        lastLevel.current = lastLevel.current * 0.9
      }
      
      setLevel(lastLevel.current)
      rafId = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(rafId)
      try { bus.disconnect(analyser) } catch {}
    }
  }, [])

  return (
    <div className="flex flex-1 items-center gap-1 h-3 px-1.5 rounded-md bg-black/20 border border-white/5">
      {[...Array(12)].map((_, i) => {
        const threshold = i / 12
        const isActive = level > threshold
        return (
          <div 
            key={i}
            className={`flex-1 h-full rounded-[1px] transition-all duration-75 ${ isActive ? i > 9 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.4)]' : 'bg-white/5' }`}
          />
        )
      })}
    </div>
  )
}


interface VoiceEngineSettingsProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void | Promise<void>
}

function EngineRow({
  label,
  hint,
  children
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/[0.04] py-6 last:border-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 md:pr-8">
        <h4 className="text-sm font-semibold text-white">{label}</h4>
        <p className="mt-1 text-xs leading-relaxed text-white/35">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function EngineNumber({
  value,
  onChange,
  min,
  max,
  suffix
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const nextValue = Number(event.target.value)
          if (Number.isFinite(nextValue) && nextValue >= min && nextValue <= max) {
            onChange(nextValue)
          }
        }}
        className="app-input !h-10 !w-28 !px-3 text-right font-mono text-sm"
      />
      {suffix && <span className="w-10 text-xs font-semibold tracking-tight text-white/20">{suffix}</span>}
    </div>
  )
}

function MentionToggle({
  active,
  title,
  hint,
  icon,
  onClick
}: {
  active: boolean
  title: string
  hint: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-12 min-w-0 items-center gap-3 rounded-lg border px-3 text-left transition-all ${
        active
          ? 'border-accent/35 bg-accent/10 text-accent shadow-[0_0_18px_rgba(var(--accent-rgb),0.08)]'
          : 'border-white/[0.07] bg-white/[0.025] text-white/45 hover:border-white/15 hover:bg-white/[0.045] hover:text-white/70'
      }`}
    >
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${active ? 'bg-accent/15' : 'bg-white/[0.045]'}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold tracking-tight text-white/75">{title}</span>
        <span className="block truncate text-[10px] font-medium text-white/28">{hint}</span>
      </span>
      <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${active ? 'bg-accent' : 'bg-white/10'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${active ? 'left-[14px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function VoiceEngineSettings({ settings, onUpdate }: VoiceEngineSettingsProps) {
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([])
  const [apiKeyDraft, setApiKeyDraft] = React.useState(settings.elevenlabsApiKey)
  const [workspaceLabelDraft, setWorkspaceLabelDraft] = React.useState('')
  const [workspaceKeyDraft, setWorkspaceKeyDraft] = React.useState('')

  React.useEffect(() => {
    setApiKeyDraft(settings.elevenlabsApiKey)
  }, [settings.elevenlabsApiKey])

  React.useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return

    void navigator.mediaDevices.enumerateDevices()
      .then((nextDevices) => setDevices(nextDevices.filter((device) => device.kind === 'audiooutput')))
      .catch(() => setDevices([]))
  }, [])

  const ttsSource = useStudioStore(s => s.audioSources.find(src => src.id === 'tts-audio'))
  const updateAudioSource = useStudioStore(s => s.updateAudioSource)

  const ttsMonitoring = ttsSource?.monitoring ?? false

  const toggleMonitoring = (value: boolean) => {
    updateAudioSource('tts-audio', { monitoring: value })
    toast.info(value ? 'TTS Monitoring Enabled' : 'TTS Monitoring Disabled')
  }

  const saveApiKey = () => {
    void onUpdate('elevenlabsApiKey', apiKeyDraft)
    toast.success('Voice provider key saved')
  }

  const addWorkspaceKey = async () => {
    const apiKey = workspaceKeyDraft.trim()
    if (!apiKey) {
      toast.error('Paste an ElevenLabs API key first')
      return
    }

    const label = workspaceLabelDraft.trim() || `Workspace ${settings.elevenlabsApiKeys.length + 1}`
    const entry = {
      id: `el-${crypto.randomUUID()}`,
      label: label.slice(0, 80),
      apiKey
    }
    const nextKeys = [...settings.elevenlabsApiKeys, entry]

    await onUpdate('elevenlabsApiKeys', nextKeys)
    if (!settings.elevenlabsApiKey && !settings.elevenlabsDefaultApiKeyId) {
      await onUpdate('elevenlabsDefaultApiKeyId', entry.id)
    }
    setWorkspaceLabelDraft('')
    setWorkspaceKeyDraft('')
    toast.success('ElevenLabs workspace added')
  }

  const deleteWorkspaceKey = async (id: string) => {
    const nextKeys = settings.elevenlabsApiKeys.filter((key) => key.id !== id)
    await onUpdate('elevenlabsApiKeys', nextKeys)
    if (settings.elevenlabsDefaultApiKeyId === id) {
      await onUpdate('elevenlabsDefaultApiKeyId', '')
    }
    toast.info('ElevenLabs workspace removed')
  }

  const setDefaultWorkspaceKey = async (id: string) => {
    await onUpdate('elevenlabsDefaultApiKeyId', id)
    toast.success('Default ElevenLabs workspace updated')
  }

  return (
    <section className="app-section-card glass relative overflow-hidden">
      {settings.tts.enabled && (
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 -translate-y-1/2 translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      )}

      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconVolume size={32} />
          </div>
          <div>
            <h2>Voice Engine</h2>
            <p>Speech routing, limits, and provider access.</p>
          </div>
        </div>
        <div className={`rounded-full px-3 py-1 text-[9px] font-semibold tracking-tight ${ settings.tts.enabled ? 'bg-accent/15 text-accent' : 'bg-white/5 text-white/25' }`}>
          {settings.tts.enabled ? 'Online' : 'Muted'}
        </div>
      </div>

      <div className="app-section-content !p-0">
        <div className="grid grid-cols-1 gap-0 xl:grid-cols-[1fr_360px]">
          <div className="px-8">
            <EngineRow label="Global Speech Output" hint="Hard enable or mute all TTS before it reaches the queue.">
              <Toggle
                value={settings.tts.enabled}
                onChange={(value) => {
                  void onUpdate('ttsEnabled', value)
                  toast.info(value ? 'TTS Engine Online' : 'TTS Engine Muted')
                }}
              />
            </EngineRow>

            <EngineRow label="Local Voice Quality" hint="Highest holds ~330MB of model weights in memory; Standard sounds nearly identical at ~90MB. Applies after restarting the app.">
              <select
                value={settings.tts.kokoroQuality}
                onChange={(event) => {
                  void onUpdate('ttsKokoroQuality', event.target.value as AppSettings['ttsKokoroQuality'])
                  toast.info('Local voice quality updates after the app restarts')
                }}
                className="h-10 w-44 rounded-lg border border-white/10 bg-black/40 px-3 text-sm font-medium transition-all hover:bg-black/60 focus:border-accent focus:outline-none"
              >
                <option value="fp32">Highest (fp32)</option>
                <option value="q8">Standard (q8)</option>
              </select>
            </EngineRow>

            <EngineRow label="Message Length Window" hint="Reject tiny spam and trim long messages before synthesis.">
              <div className="grid grid-cols-2 gap-3">
                <EngineNumber
                  value={settings.tts.minLength}
                  onChange={(value) => void onUpdate('ttsMinLength', value)}
                  min={0}
                  max={100}
                  suffix="min"
                />
                <EngineNumber
                  value={settings.tts.maxLength}
                  onChange={(value) => void onUpdate('ttsMaxLength', value)}
                  min={20}
                  max={1000}
                  suffix="max"
                />
              </div>
            </EngineRow>

            <EngineRow label="Burst Control" hint="Cap per-user queue pressure and cool down repeated messages.">
              <div className="grid grid-cols-2 gap-3">
                <EngineNumber
                  value={settings.tts.perUserLimit}
                  onChange={(value) => void onUpdate('ttsPerUserLimit', value)}
                  min={1}
                  max={20}
                  suffix="user"
                />
                <EngineNumber
                  value={settings.tts.duplicateWindow}
                  onChange={(value) => void onUpdate('ttsDuplicateWindow', value)}
                  min={5}
                  max={120}
                  suffix="sec"
                />
              </div>
            </EngineRow>

            <EngineRow label="Mention Handling" hint="Tune how @names are spoken or ignored when chat gets noisy.">
              <div className="grid w-full gap-2 sm:grid-cols-2 md:w-[380px]">
                <MentionToggle
                  active={settings.tts.readAtSymbol}
                  title="Read @"
                  hint="Speak the symbol"
                  icon={<IconAt size={15} />}
                  onClick={() => void onUpdate('ttsReadAtSymbol', !settings.tts.readAtSymbol)}
                />
                <MentionToggle
                  active={settings.tts.skipMessagesStartingWithAt}
                  title="Skip @"
                  hint="Ignore @ starters"
                  icon={<IconShieldCheck size={15} />}
                  onClick={() => void onUpdate('ttsSkipMessagesStartingWithAt', !settings.tts.skipMessagesStartingWithAt)}
                />
              </div>
            </EngineRow>
          </div>

          <aside className="border-t border-white/[0.04] bg-black/10 p-8 xl:border-l xl:border-t-0">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconHeadphones size={18} className="text-accent" />
                <div>
                  <h3 className="text-xs font-medium tracking-normal text-white/70">Monitor Route</h3>
                  <p className="text-[11px] text-white/25">Send speech to a device or virtual cable.</p>
                </div>
              </div>
              <Toggle value={ttsMonitoring} onChange={toggleMonitoring} />
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[9px] font-semibold tracking-normal text-white/20">Live Signal</span>
              </div>
              <TtsSignalMeter />
            </div>

            <select
              value={settings.audio.outputDeviceId || 'default'}
              onChange={(event) => void onUpdate('audioOutputDeviceId', event.target.value)}
              className="mb-8 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm font-medium transition-all hover:bg-black/60 focus:border-accent focus:outline-none"
            >
              <option value="default">Default System Output</option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Unknown Output (${device.deviceId.slice(0, 8)}...)`}
                </option>
              ))}
            </select>

            <div className="mb-4 flex items-center gap-3">
              <IconKey size={18} className="text-accent" />
              <div>
                <h3 className="text-xs font-medium tracking-normal text-white/70">ElevenLabs</h3>
                <p className="text-[11px] text-white/25">Stored locally with OS encryption when available.</p>
              </div>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder="Paste API key..."
                className="app-input !h-11 !w-full !px-4 !text-sm"
              />
              <button
                onClick={saveApiKey}
                disabled={apiKeyDraft === settings.elevenlabsApiKey}
                className="app-button w-full !h-11 !text-xs font-semibold tracking-tight disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconGauge size={15} />
                {apiKeyDraft === settings.elevenlabsApiKey ? 'Provider Key Current' : 'Save Provider Key'}
              </button>
            </div>

            <div className="mt-6 border-t border-white/[0.06] pt-5">
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-white/60">Additional workspaces</h4>
                <p className="mt-1 text-[11px] leading-relaxed text-white/25">
                  Add shared keys here, then pick the matching workspace in a voice profile or user voice rule.
                </p>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={workspaceLabelDraft}
                  onChange={(event) => setWorkspaceLabelDraft(event.target.value)}
                  placeholder="Label, e.g. Logan"
                  className="app-input !h-10 !w-full !px-3 !text-xs"
                />
                <input
                  type="password"
                  value={workspaceKeyDraft}
                  onChange={(event) => setWorkspaceKeyDraft(event.target.value)}
                  placeholder="Shared API key..."
                  className="app-input !h-10 !w-full !px-3 !text-xs"
                />
                <button
                  onClick={() => void addWorkspaceKey()}
                  className="app-button w-full !h-10 !text-xs font-semibold"
                >
                  <IconPlus size={14} />
                  Add Workspace Key
                </button>
              </div>

              {settings.elevenlabsApiKeys.length > 0 && (
                <div className="mt-4 space-y-2">
                  {settings.elevenlabsApiKeys.map((key) => (
                    <div
                      key={key.id}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-white/75">{key.label}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-white/25">
                            {maskApiKey(key.apiKey)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteWorkspaceKey(key.id)}
                          className="app-button !h-8 !w-8 !p-0 hover:!border-danger/30 hover:!text-danger"
                          title="Remove workspace key"
                        >
                          <IconTrash size={13} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void setDefaultWorkspaceKey(key.id)}
                        disabled={settings.elevenlabsDefaultApiKeyId === key.id}
                        className="mt-2 text-[10px] font-semibold text-accent transition-colors hover:text-accent/80 disabled:text-white/25"
                      >
                        {settings.elevenlabsDefaultApiKeyId === key.id ? 'Default workspace' : 'Make default'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}

function maskApiKey(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 8) return 'Saved key'
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

