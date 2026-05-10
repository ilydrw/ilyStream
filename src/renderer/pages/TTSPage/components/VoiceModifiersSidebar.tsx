import {IconMicrophone} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import { VoiceModifiers } from '../../../../shared/app-settings'

interface VoiceModifiersSidebarProps {
  voiceModifiers: VoiceModifiers
  onUpdateModifiers: (updates: Partial<VoiceModifiers>) => void
}

export function VoiceModifiersSidebar({
  voiceModifiers,
  onUpdateModifiers
}: VoiceModifiersSidebarProps) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconMicrophone size={32} />
          </div>
          <div>
            <h2>Voice Modifiers</h2>
            <p>Real-time processing.</p>
          </div>
        </div>
      </div>
      <div className="app-section-content">
        <div className="flex flex-col gap-6">
          {/* IconRadio IconFilter */}
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white mb-0.5">IconRadio IconFilter</h4>
              <p className="text-xs text-white/40">High-pass + slight crunch for a broadcast feel.</p>
            </div>
            <Toggle 
              value={voiceModifiers.radioFilter} 
              onChange={(v) => onUpdateModifiers({ radioFilter: v })} 
            />
          </div>

          {/* Speed Ramping */}
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white mb-0.5">Speed Ramping</h4>
              <p className="text-xs text-white/40">Speed up for excitement (!) or slow for drama (...).</p>
            </div>
            <Toggle 
              value={voiceModifiers.speedRamping} 
              onChange={(v) => onUpdateModifiers({ speedRamping: v })} 
            />
          </div>

          {/* Pitch Shifting */}
          <div className="flex flex-col gap-3">
            <label className="text-xs font-black uppercase tracking-widest text-white/40">Pitch Shift Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {(['low', 'normal', 'high', 'dynamic'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onUpdateModifiers({ pitchShifting: mode })}
                  className={`px-4 py-3 rounded-xl border text-xs font-bold transition-all ${
                    voiceModifiers.pitchShifting === mode
                      ? 'bg-white border-white text-black'
                      : 'bg-white/[0.03] border-white/5 text-white/40 hover:border-white/15'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
