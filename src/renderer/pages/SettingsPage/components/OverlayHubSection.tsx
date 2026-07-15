import React from 'react'
import {IconLayout} from '@tabler/icons-react'
import { AppSettings } from '../../../../shared/app-settings'
import type { OverlayRuntimeStatus } from '../../../../shared/overlay'
import { NumberInput, StatusBadge } from './SettingsShared'

interface OverlayHubSectionProps {
  settings: AppSettings
  overlayStatus: OverlayRuntimeStatus | null
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function OverlayHubSection({ settings, overlayStatus, onUpdate }: OverlayHubSectionProps) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconLayout size={32} />
          </div>
          <div>
            <h2>Overlay Hub</h2>
            <p>Local asset server.</p>
          </div>
        </div>
      </div>
      
      <div className="app-section-content !p-0">
        <div className="flex flex-col gap-6 p-8">
          <div className="flex items-center justify-between py-6">
            <div className="pr-10">
              <h4 className="text-sm font-semibold text-white mb-1">Server Port</h4>
              <p className="text-xs text-white/20 leading-relaxed">Target port for local web telemetry assets.</p>
            </div>
            <div className="flex-shrink-0">
              <NumberInput
                value={settings.overlay.port}
                onChange={(value) => onUpdate('overlayPort', value)}
                min={1024}
                max={65535}
              />
            </div>
          </div>

          <div className="mt-4 p-8 rounded-lg bg-black/40 border border-white/5 space-y-6 group hover:border-white/10 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-tight text-white/30">Overlay Server</span>
              <StatusBadge status={overlayStatus} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-white/25 font-semibold">Server origin</span>
                <span className="font-mono text-white/55 truncate">
                  {overlayStatus?.running && overlayStatus.port
                    ? `http://127.0.0.1:${overlayStatus.port}`
                    : `http://127.0.0.1:${settings.overlay.port}`}
                </span>
              </div>
              <p className="text-xs text-white/35 leading-relaxed">
                OBS browser-source URLs are generated on saved widget cards in Overlays & Widgets. This server setting only controls the port those widget URLs use.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

