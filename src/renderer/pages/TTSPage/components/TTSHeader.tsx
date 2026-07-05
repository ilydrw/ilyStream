import React from 'react'
import {IconVolume} from '@tabler/icons-react'
import { PageHeader } from '../../../components/layout/PageHeader'

interface TTSHeaderProps {
  enabled: boolean
  onToggle: () => void
}

export function TTSHeader({ enabled, onToggle }: TTSHeaderProps) {
  return (
    <PageHeader
      title="Text-to-Speech"
      description="Manage voices, routing, queue behavior, and user-specific speech rules."
      icon={IconVolume}
      actions={
        <button
          onClick={onToggle}
          className={`app-button-primary !h-12 !px-8 relative overflow-hidden transition-all ${!enabled ? '!bg-white/[0.03] !text-white/40 !border-white/5 shadow-none' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
        >
          <span className="relative z-10 font-semibold">
            {enabled ? 'System Online' : 'Engine Muted'}
          </span>
        </button>
      }
    />
  )
}
