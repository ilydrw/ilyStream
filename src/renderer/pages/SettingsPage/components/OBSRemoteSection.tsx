import React from 'react'
import {IconVideo} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import { AppSettings } from '../../../../shared/app-settings'
import type { OBSRuntimeStatus } from '../../../../shared/obs'
import { SettingRow, TextInput, NumberInput, RuntimeValue, OBSStatusBadge } from './SettingsShared'

interface OBSRemoteSectionProps {
  settings: AppSettings
  obsStatus: OBSRuntimeStatus | null
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onConnect: () => void
}

export function OBSRemoteSection({ settings, obsStatus, onUpdate, onConnect }: OBSRemoteSectionProps) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconVideo size={32} />
          </div>
          <div>
            <h2>OBS Remote</h2>
            <p>WebSocket connectivity.</p>
          </div>
        </div>
      </div>
      
      <div className="app-section-content !p-0">
        <div className="flex flex-col gap-6 p-8">
          <SettingRow label="Automation Link" hint="Enable control over your OBS Studio instance.">
            <Toggle value={settings.obsEnabled} onChange={(value) => onUpdate('obsEnabled', value)} />
          </SettingRow>

          <SettingRow label="Host Address" hint="Target machine IP (usually local loopback).">
            <TextInput
              value={settings.obsHost}
              onChange={(value) => onUpdate('obsHost', value)}
              placeholder="127.0.0.1"
            />
          </SettingRow>

          <SettingRow label="WebSocket Port" hint="Configured in OBS Studio WebSocket settings.">
            <NumberInput
              value={settings.obsPort}
              onChange={(value) => onUpdate('obsPort', value)}
              min={1}
              max={65535}
            />
          </SettingRow>

          <SettingRow label="Access Password" hint="Configured in OBS WebSocket server settings.">
            <TextInput
              value={settings.obsPassword}
              onChange={(value) => onUpdate('obsPassword', value)}
              placeholder="OBS WebSocket Password"
              type="password"
            />
          </SettingRow>

          <div className="mt-4 p-8 rounded-3xl bg-black/40 border border-white/5 space-y-5 group hover:border-white/10 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-white/30">Runtime Status</span>
              <OBSStatusBadge status={obsStatus} />
            </div>
            <div className="space-y-3">
              <RuntimeValue label="Endpoint" value={`ws://${settings.obsHost}:${settings.obsPort}`} />
              {obsStatus?.currentSceneName && <RuntimeValue label="Active Scene" value={obsStatus.currentSceneName} />}
              {obsStatus?.obsVersion && <RuntimeValue label="Binary" value={obsStatus.obsVersion} />}
            </div>
            <button
              onClick={onConnect}
              disabled={!settings.obsEnabled}
              className="app-button w-full !h-12 !text-xs font-black uppercase tracking-widest bg-accent/5 hover:bg-accent/10 text-accent border-accent/20"
            >
              {obsStatus?.connecting ? 'Linking...' : 'DeviceFloppy & Connect'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
