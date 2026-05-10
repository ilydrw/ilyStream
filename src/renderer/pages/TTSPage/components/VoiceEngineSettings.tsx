import React from 'react'
import {IconAt, IconGauge, IconHeadphones, IconKey, IconShieldCheck, IconVolume, IconActivity} from '@tabler/icons-react'
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
            className={`flex-1 h-full rounded-[1px] transition-all duration-75 ${
              isActive 
                ? i > 9 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.4)]' 
                : 'bg-white/5'
            }`}
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
        <h4 className="text-sm font-bold text-white">{label}</h4>
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
      {suffix && <span className="w-10 text-xs font-black uppercase tracking-widest text-white/20">{suffix}</span>}
    </div>
  )
}

export function VoiceEngineSettings({ settings, onUpdate }: VoiceEngineSettingsProps) {
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([])
  const [apiKeyDraft, setApiKeyDraft] = React.useState(settings.elevenlabsApiKey)

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

  return (
    <section className="app-section-card glass relative overflow-hidden">
      {settings.ttsEnabled && (
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
        <div className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${
          settings.ttsEnabled ? 'bg-accent/15 text-accent' : 'bg-white/5 text-white/25'
        }`}>
          {settings.ttsEnabled ? 'Online' : 'Muted'}
        </div>
      </div>

      <div className="app-section-content !p-0">
        <div className="grid grid-cols-1 gap-0 xl:grid-cols-[1fr_360px]">
          <div className="px-8">
            <EngineRow label="Global Speech Output" hint="Hard enable or mute all TTS before it reaches the queue.">
              <Toggle
                value={settings.ttsEnabled}
                onChange={(value) => {
                  void onUpdate('ttsEnabled', value)
                  toast.info(value ? 'TTS Engine Online' : 'TTS Engine Muted')
                }}
              />
            </EngineRow>

            <EngineRow label="Message Length Window" hint="Reject tiny spam and trim long messages before synthesis.">
              <div className="grid grid-cols-2 gap-3">
                <EngineNumber
                  value={settings.ttsMinLength}
                  onChange={(value) => void onUpdate('ttsMinLength', value)}
                  min={0}
                  max={100}
                  suffix="min"
                />
                <EngineNumber
                  value={settings.ttsMaxLength}
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
                  value={settings.ttsPerUserLimit}
                  onChange={(value) => void onUpdate('ttsPerUserLimit', value)}
                  min={1}
                  max={20}
                  suffix="user"
                />
                <EngineNumber
                  value={settings.ttsDuplicateWindow}
                  onChange={(value) => void onUpdate('ttsDuplicateWindow', value)}
                  min={5}
                  max={120}
                  suffix="sec"
                />
              </div>
            </EngineRow>

            <EngineRow label="Mention Handling" hint="Tune how @names are spoken or ignored when chat gets noisy.">
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => void onUpdate('ttsReadAtSymbol', !settings.ttsReadAtSymbol)}
                  className={`app-button !h-10 !px-4 ${settings.ttsReadAtSymbol ? '!bg-accent/10 text-accent !border-accent/20' : 'text-white/40'}`}
                  title="Read @ symbols aloud"
                >
                  <IconAt size={15} />
                  Read
                </button>
                <button
                  onClick={() => void onUpdate('ttsSkipMessagesStartingWithAt', !settings.ttsSkipMessagesStartingWithAt)}
                  className={`app-button !h-10 !px-4 ${settings.ttsSkipMessagesStartingWithAt ? '!bg-accent/10 text-accent !border-accent/20' : 'text-white/40'}`}
                  title="Skip messages starting with @"
                >
                  <IconShieldCheck size={15} />
                  Skip
                </button>
              </div>
            </EngineRow>
          </div>

          <aside className="border-t border-white/[0.04] bg-black/10 p-8 xl:border-l xl:border-t-0">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconHeadphones size={18} className="text-accent" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Monitor IconRoute</h3>
                  <p className="text-[11px] text-white/25">IconSend speech to a device or virtual cable.</p>
                </div>
              </div>
              <Toggle value={ttsMonitoring} onChange={toggleMonitoring} />
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/20">Live Signal</span>
              </div>
              <TtsSignalMeter />
            </div>

            <select
              value={settings.audioOutputDeviceId || 'default'}
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
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/70">ElevenLabs</h3>
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
                className="app-button w-full !h-11 !text-xs font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconGauge size={15} />
                {apiKeyDraft === settings.elevenlabsApiKey ? 'Provider Key Current' : 'DeviceFloppy Provider Key'}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
