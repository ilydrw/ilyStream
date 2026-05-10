import {IconBolt} from '@tabler/icons-react'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { Toggle } from '../../../components/ui/Inputs'
import { PLATFORM_LABELS, type RelayTagMode } from '../../../../shared/chat-relay'
import type { Platform } from '../../../../main/platforms/types'
import { relayTagModeOptions } from '../constants'

interface AutoRelaySidebarProps {
  chatAutoRelayEnabled: boolean
  chatRelayTagMode: RelayTagMode
  chatAutoRelayPlatforms: Record<Platform, boolean>
  onUpdateRelaySetting: (key: any, value: any) => void
}

export function AutoRelaySidebar({
  chatAutoRelayEnabled,
  chatRelayTagMode,
  chatAutoRelayPlatforms,
  onUpdateRelaySetting
}: AutoRelaySidebarProps) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconBolt size={32} />
          </div>
          <div>
            <h2>Auto-Relay</h2>
            <p>Mirror messaging.</p>
          </div>
        </div>
        <Toggle 
          value={chatAutoRelayEnabled} 
          onChange={(val) => onUpdateRelaySetting('chatAutoRelayEnabled', val)} 
        />
      </div>
      <div className="app-section-content">
        <div className="flex flex-col gap-2 mb-6">
          <label className="text-xs font-black tracking-widest text-white/50">Relay Format</label>
          <select
            value={chatRelayTagMode}
            onChange={(e) => onUpdateRelaySetting('chatRelayTagMode', e.target.value as RelayTagMode)}
            className="app-select !text-sm"
          >
            {relayTagModeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <p className="text-xs text-white/30 italic">
            {relayTagModeOptions.find(o => o.value === chatRelayTagMode)?.description}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs font-black tracking-widest text-white/50">Mirror From</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(chatAutoRelayPlatforms) as Platform[]).map((p) => {
              const enabled = chatAutoRelayPlatforms[p]
              return (
                <button
                  key={`relay-toggle-${p}`}
                  onClick={() => onUpdateRelaySetting('chatAutoRelayPlatforms', { ...chatAutoRelayPlatforms, [p]: !enabled })}
                  className={`flex items-center gap-2 h-12 px-4 rounded-xl border text-sm font-bold transition-all ${
                    enabled ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-white/[0.03] border-white/5 text-white/60 hover:border-white/10 hover:text-white/90'
                  }`}
                >
                  <PlatformLogo platform={p} size={14} />
                  {PLATFORM_LABELS[p]}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
