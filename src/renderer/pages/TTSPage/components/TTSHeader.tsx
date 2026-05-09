import React from 'react'
import { Volume2 } from 'lucide-react'

interface TTSHeaderProps {
  enabled: boolean
  onToggle: () => void
}

export function TTSHeader({ enabled, onToggle }: TTSHeaderProps) {
  return (
    <header className="app-page-header">
      <div className="flex items-center gap-6">
        <div className="flex items-center justify-center">
          <Volume2 size={32} className="text-accent" />
        </div>
        <div>
          <div className="app-header-eyebrow">
            <Volume2 size={14} className="text-accent" />
            <span>Core Configuration</span>
          </div>
          <h1>Text-to-Speech</h1>
          <p className="app-page-intro">
            Neural voice synthesis for your broadcast. Configure custom profiles, 
            audience permissions, and global speech logic.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onToggle}
          className={`
            app-button-primary !h-12 !px-8 relative overflow-hidden transition-all
            ${!enabled ? '!bg-white/[0.03] !text-white/40 !border-white/5 shadow-none' : 'hover:scale-[1.02] active:scale-[0.98]'}
          `}
        >
          <span className="relative z-10 font-bold">
            {enabled ? 'System Online' : 'Engine Muted'}
          </span>
        </button>
      </div>
    </header>
  )
}
