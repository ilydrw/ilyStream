import { Activity, BadgeCheck, Clapperboard, Cpu, Gauge, Radio, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Toggle } from '../../../components/ui/Inputs'
import type { AppSettings } from '../../../../shared/app-settings'
import {
  getStreamingEncoderLabel,
  type StreamingEncoderDiagnostics,
  type StreamingEncoderPreference
} from '../../../../shared/streaming'
import { Select, type SelectOption } from '../../../components/ui/Select'
import { NumberInput, SettingRow, TextInput } from './SettingsShared'

interface BroadcastDefaultsSectionProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

const ENCODER_OPTIONS: SelectOption[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'h264_nvenc', label: 'NVIDIA NVENC' },
  { value: 'h264_amf', label: 'AMD AMF' },
  { value: 'h264_qsv', label: 'Intel Quick Sync' },
  { value: 'libx264', label: 'Software x264' }
]

export function BroadcastDefaultsSection({ settings, onUpdate }: BroadcastDefaultsSectionProps) {
  const resolution = `${settings.streamingWidth} x ${settings.streamingHeight}`
  const [encoderDiagnostics, setEncoderDiagnostics] = useState<StreamingEncoderDiagnostics | null>(null)
  const [isTestingEncoder, setIsTestingEncoder] = useState(false)

  const selectedProbe = useMemo(() => {
    if (!encoderDiagnostics) return null
    return encoderDiagnostics.probes.find((probe) => probe.encoder === encoderDiagnostics.selectedEncoder) || null
  }, [encoderDiagnostics])

  const refreshEncoderDiagnostics = async (force = false) => {
    if (!window.api?.streaming) return
    setIsTestingEncoder(true)
    try {
      const diagnostics = force
        ? await window.api.streaming.testEncoder(settings.streamingEncoder)
        : await window.api.streaming.getEncoderDiagnostics(settings.streamingEncoder)
      setEncoderDiagnostics(diagnostics as StreamingEncoderDiagnostics)
    } finally {
      setIsTestingEncoder(false)
    }
  }

  useEffect(() => {
    void refreshEncoderDiagnostics(false)
  }, [settings.streamingEncoder])

  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <Clapperboard size={32} />
          </div>
          <div>
            <h2>Broadcast Defaults</h2>
            <p>Encoder target and outbound stream credentials.</p>
          </div>
        </div>
        <Toggle value={settings.streamingEnabled} onChange={(value) => onUpdate('streamingEnabled', value)} />
      </div>

      <div className="app-section-content !p-0">
        <div className="p-8">
          <SettingRow label="RTMP Endpoint" hint="Primary ingest URL for direct streaming when ilyStream owns the output path.">
            <TextInput
              value={settings.streamingRtmpUrl}
              onChange={(value) => onUpdate('streamingRtmpUrl', value)}
              placeholder="rtmp://..."
              className="!w-80"
            />
          </SettingRow>

          <SettingRow label="Stream Key" hint="Stored locally and encrypted with the OS vault when available.">
            <TextInput
              value={settings.streamingStreamKey}
              onChange={(value) => onUpdate('streamingStreamKey', value)}
              placeholder="Live stream key"
              type="password"
              className="!w-80"
            />
          </SettingRow>

          <SettingRow label="Video Encoder" hint="Auto prefers NVENC, AMF, or Quick Sync when the GPU and FFmpeg probe pass.">
            <div className="flex w-80 flex-col gap-3">
              <div className="flex gap-2">
                <Select
                  value={settings.streamingEncoder}
                  options={ENCODER_OPTIONS}
                  onChange={(value) => onUpdate('streamingEncoder', value as StreamingEncoderPreference)}
                  className="flex-1"
                  buttonClassName="!h-12"
                  prefix={<Cpu size={16} className="text-accent" />}
                />
                <button
                  type="button"
                  onClick={() => void refreshEncoderDiagnostics(true)}
                  disabled={isTestingEncoder}
                  className="app-button !h-12 !w-12 !px-0"
                  title="Test encoder"
                >
                  <RefreshCw size={16} className={isTestingEncoder ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2">
                  {selectedProbe?.supported ? (
                    <BadgeCheck size={15} className="text-success" />
                  ) : (
                    <TriangleAlert size={15} className="text-warning" />
                  )}
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/30">
                    {encoderDiagnostics
                      ? getStreamingEncoderLabel(encoderDiagnostics.selectedEncoder)
                      : 'Checking encoder'}
                  </p>
                </div>
                <p className="text-xs font-medium leading-relaxed text-white/45">
                  {encoderDiagnostics?.selectedReason || 'Running a small FFmpeg probe against local GPU encoders.'}
                </p>
                {encoderDiagnostics?.gpuNames.length ? (
                  <p className="mt-2 truncate text-[10px] font-bold uppercase tracking-widest text-white/20">
                    {encoderDiagnostics.gpuNames.join(' / ')}
                  </p>
                ) : null}
                {selectedProbe?.error ? (
                  <p className="mt-2 line-clamp-2 text-[10px] font-medium text-warning/80">{selectedProbe.error}</p>
                ) : null}
              </div>
            </div>
          </SettingRow>

          <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            <SettingRow label="Bitrate" hint="Video bitrate target in Kbps.">
              <NumberInput
                value={settings.streamingBitrate}
                onChange={(value) => onUpdate('streamingBitrate', value)}
                min={500}
                max={51000}
              />
            </SettingRow>

            <SettingRow label="Frame Rate" hint="Default encoder FPS.">
              <NumberInput
                value={settings.streamingFps}
                onChange={(value) => onUpdate('streamingFps', value)}
                min={24}
                max={240}
              />
            </SettingRow>

            <SettingRow label="Canvas Width" hint="Output width in pixels.">
              <NumberInput
                value={settings.streamingWidth}
                onChange={(value) => onUpdate('streamingWidth', value)}
                min={640}
                max={7680}
              />
            </SettingRow>

            <SettingRow label="Canvas Height" hint="Output height in pixels.">
              <NumberInput
                value={settings.streamingHeight}
                onChange={(value) => onUpdate('streamingHeight', value)}
                min={360}
                max={4320}
              />
            </SettingRow>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <Radio size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Output</p>
                <p className="text-sm font-bold text-white">{settings.streamingEnabled ? 'Armed' : 'Standby'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <Gauge size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Encoder</p>
                <p className="text-sm font-bold text-white">
                  {encoderDiagnostics ? getStreamingEncoderLabel(encoderDiagnostics.selectedEncoder) : `${settings.streamingBitrate} Kbps`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <Activity size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Canvas</p>
                <p className="text-sm font-bold text-white">{resolution} @ {settings.streamingFps}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
