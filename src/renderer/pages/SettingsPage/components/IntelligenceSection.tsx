import React, { useState } from 'react'
import {IconSparkles} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import { AppSettings } from '../../../../shared/app-settings'
import { NumberInput, SettingRow, TextInput } from './SettingsShared'
import { toast } from '../../../components/ui/Toast'

interface IntelligenceSectionProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function IntelligenceSection({ settings, onUpdate }: IntelligenceSectionProps) {
  const [isTesting, setIsTesting] = useState(false)

  const handleTestConnection = async () => {
    if (!settings.ai.endpoint) {
      toast.error('Endpoint URL is required')
      return
    }
    
    setIsTesting(true)
    try {
      const response = await window.api.ai.testConnection()
      if (response.success) {
        toast.success('AI Connection Successful!')
      } else {
        toast.error(`Connection Failed: ${response.error}`)
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`)
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <section className="app-section-card glass relative overflow-hidden">
      {/* Active Indicator */}
      {settings.ai.enabled && (
        <div className="absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 bg-accent/10 blur-3xl rounded-full" />
      )}

      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconSparkles size={32} />
          </div>
          <div>
            <h2>AI Co-Host</h2>
            <p>Neural brain for stream interaction.</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
          settings.ai.enabled ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/20'
        }`}>
          {settings.ai.enabled ? 'Active' : 'Offline'}
        </div>
      </div>
      
      <div className="app-section-content !p-0">
        <div className="flex flex-col gap-6 p-8">
          <SettingRow label="Global Brain" hint="Enable automated moderation, witty responses, and stream context.">
            <Toggle 
              value={settings.ai.enabled} 
              onChange={(value) => {
                onUpdate('aiEnabled', value)
                toast.info(value ? 'AI Agent Activated' : 'AI Agent Standby')
              }} 
            />
          </SettingRow>

          <SettingRow label="Endpoint URL" hint="Base URL for your AI provider (Ollama, OpenAI, etc).">
            <div className="flex gap-3 w-full">
              <TextInput
                value={settings.ai.endpoint || ''}
                onChange={(value) => onUpdate('aiEndpoint', value)}
                placeholder="http://localhost:11434/"
                className="flex-1"
              />
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className={`
                  px-5 h-[42px] rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all
                  ${isTesting ? 'bg-white/5 text-white/20' : 'bg-white/5 hover:bg-white/10 text-white/60'}
                `}
              >
                {isTesting ? 'Testing...' : 'Test'}
              </button>
            </div>
          </SettingRow>

          <SettingRow label="Access Key" hint="Securely stored locally. Leave empty for local models.">
            <TextInput
              value={settings.ai.apiKey || ''}
              onChange={(value) => onUpdate('aiApiKey', value)}
              placeholder="sk-..."
              type="password"
            />
          </SettingRow>

          <div className="grid grid-cols-2 gap-10 py-6">
            <SettingRow label="Response Depth" hint="Max tokens per message.">
              <NumberInput
                value={settings.ai.maxTokens}
                onChange={(value) => onUpdate('aiMaxTokens', value)}
                min={10}
                max={4096}
              />
            </SettingRow>
            <div className="flex items-center justify-end">
              <div className="text-right">
                <span className="block text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Provider</span>
                <span className="block text-xs font-bold text-accent">Ollama / OpenAI Compatible</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 py-6 mt-4 bg-white/[0.01] rounded-3xl p-6 border border-white/[0.03]">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold text-white">Neural Persona (System Prompt)</span>
              <span className="text-xs text-white/20 leading-relaxed">Define exactly how your AI co-host behaves and reacts.</span>
            </div>
            <textarea
              value={settings.ai.systemPrompt}
              onChange={(event) => onUpdate('aiSystemPrompt', event.target.value)}
              className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-accent/40 min-h-[140px] resize-y custom-scrollbar transition-all"
              placeholder="You are a witty AI co-host named ILY. You keep responses brief, use moderate humor, and prioritize the streamer's context."
            />
          </div>
        </div>
      </div>
    </section>
  )
}

