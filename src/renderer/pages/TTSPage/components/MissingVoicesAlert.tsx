import React from 'react'
import {IconVolumeOff} from '@tabler/icons-react'
import type { VoiceProfile } from '../../../../main/tts/voice-profiles'

interface MissingVoicesAlertProps {
  missingProfiles: VoiceProfile[]
}

export function MissingVoicesAlert({ missingProfiles }: MissingVoicesAlertProps) {
  if (missingProfiles.length === 0) return null

  return (
    <div className="flex items-center gap-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-6 py-4 text-sm text-rose-400 font-bold uppercase tracking-wider mb-8 animate-alert">
      <div className="p-2 bg-rose-500/10 rounded-lg">
        <IconVolumeOff size={18} />
      </div>
      <div className="flex-1">
        <p className="mb-0.5">Hardware Incompatibility Detected</p>
        <span className="text-[10px] text-rose-400/60 font-medium normal-case leading-tight">
          {missingProfiles.length === 1
            ? `The profile "${missingProfiles[0]?.name}" references a system voice not found on this machine. It will use a fallback.`
            : `${missingProfiles.length} profiles use voices that are unavailable on this hardware. IconCheck your local speech settings.`}
        </span>
      </div>
    </div>
  )
}
