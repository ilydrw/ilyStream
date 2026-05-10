import {IconActivity, IconMovie, IconGauge, IconRadio} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import type { AppSettings } from '../../../../shared/app-settings'
import { NumberInput, SettingRow, TextInput } from './SettingsShared'

interface BroadcastDefaultsSectionProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function BroadcastDefaultsSection({ settings, onUpdate }: BroadcastDefaultsSectionProps) {
  const resolution = `${settings.streamingWidth} x ${settings.streamingHeight}`

  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconMovie size={32} />
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
              <IconRadio size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Output</p>
                <p className="text-sm font-bold text-white">{settings.streamingEnabled ? 'Armed' : 'Standby'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <IconGauge size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Encoder</p>
                <p className="text-sm font-bold text-white">{settings.streamingBitrate} Kbps</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <IconActivity size={18} className="text-accent" />
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
