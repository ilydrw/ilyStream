import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {IconRobot, IconCpu, IconBolt, IconKey, IconWorld, IconMessage, IconPower, IconActivity, IconTerminal2} from '@tabler/icons-react'
import { Toggle } from '../../components/ui/Inputs'
import { toast } from '../../components/ui/Toast'
import { resolveAppSettings, type AppSettings } from '../../../shared/app-settings'
import AICoHostIcon from '../../assets/ai-co-host.svg'

export default function AICoHostPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected')

  useEffect(() => {
    window.api.settings.getAll().then((s: any) => {
      setSettings(resolveAppSettings(s))
    })

    const unsubscribe = window.api.on('settings:changed', (s: any) => {
      setSettings(resolveAppSettings(s))
    })

    return unsubscribe
  }, [])

  const onUpdate = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (!settings) return
    setSettings((prev) => (prev ? { ...prev, [key]: value } : null))
    window.api.settings.set(key, value)
  }

  const handleTestConnection = async () => {
    if (!settings?.aiEndpoint) {
      toast.error('Endpoint URL is required')
      return
    }
    
    setIsTesting(true)
    try {
      const response = await window.api.ai.testConnection()
      if (response.success) {
        toast.success('Neural Link Established')
        setStatus('connected')
      } else {
        toast.error(`Neural Link Failed: ${response.error}`)
        setStatus('error')
      }
    } catch (err: any) {
      toast.error(`System Error: ${err.message}`)
      setStatus('error')
    } finally {
      setIsTesting(false)
    }
  }

  if (!settings) return null

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <img src={AICoHostIcon} className="w-12 h-12 object-contain" alt="AI Co-Host" />
          </div>
          <div>
            <h1>AI Co-Host</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              onUpdate('aiEnabled', !settings.aiEnabled)
              toast.info(settings.aiEnabled ? 'AI Agent Standby' : 'AI Agent Activated')
            }}
            className={`app-button !h-12 !px-8 !text-[10px] font-black tracking-[0.2em] transition-all ${
              settings.aiEnabled ? 'bg-accent text-white' : 'bg-white/5 text-white/40 border-white/10'
            }`}
          >
            <IconPower size={16} />
            {settings.aiEnabled ? 'AGENT ACTIVE' : 'AGENT BYPASSED'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8 mt-12">
        {/* Main Configuration */}
        <div className="col-span-8 space-y-8">
          <div className="app-section-card glass">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-accent">
                  <IconWorld size={32} />
                </div>
                <div>
                  <h2>Brain Provider</h2>
                </div>
              </div>
            </div>

            <div className="app-section-content">
              <div className="space-y-10">
                <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Endpoint URL</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={settings.aiEndpoint || ''}
                        onChange={(e) => onUpdate('aiEndpoint', e.target.value)}
                        placeholder="http://localhost:11434/"
                        className="flex-1 h-12 bg-black/40 border border-white/5 rounded-2xl px-5 text-sm font-medium outline-none focus:border-accent/40 transition-all"
                      />
                      <button
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        className={`h-12 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          isTesting ? 'bg-white/5 text-white/20' : 'bg-accent/10 hover:bg-accent/20 text-accent'
                        }`}
                      >
                        {isTesting ? 'TESTING' : 'PING'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Access Key</label>
                    <div className="relative">
                      <IconKey size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20" />
                      <input 
                        type="password" 
                        value={settings.aiApiKey || ''}
                        onChange={(e) => onUpdate('aiApiKey', e.target.value)}
                        placeholder="••••••••••••••••"
                        className="w-full h-12 bg-black/40 border border-white/5 rounded-2xl pl-12 pr-5 text-sm font-medium outline-none focus:border-accent/40 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white mb-1">Neural Persona</h3>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                      <IconMessage size={14} className="text-accent" />
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Active Template: Custom</span>
                    </div>
                  </div>
                  
                  <textarea
                    value={settings.aiSystemPrompt}
                    onChange={(e) => onUpdate('aiSystemPrompt', e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-3xl p-8 text-sm leading-relaxed font-medium outline-none focus:border-accent/40 min-h-[280px] resize-none custom-scrollbar transition-all"
                    placeholder="You are a witty AI co-host named ILY..."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Intelligence Metrics */}
        <div className="col-span-4 space-y-8">
          <div className="app-section-card glass">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-accent">
                  <IconCpu size={32} />
                </div>
                <div>
                  <h2>Parameters</h2>
                </div>
              </div>
            </div>

            <div className="app-section-content">
              <div className="space-y-10">
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Response Depth</span>
                    <span className="text-[10px] font-mono text-accent">{settings.aiMaxTokens} tokens</span>
                  </div>
                  <input 
                    type="range" min="64" max="4096" step="64" 
                    value={settings.aiMaxTokens}
                    onChange={(e) => onUpdate('aiMaxTokens', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-accent"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Temperature</span>
                    <span className="text-[10px] font-mono text-accent">0.7</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.1" value="0.7"
                    className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-accent"
                  />
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-white/5">
                <div className="flex items-center gap-3 mb-6">
                  <IconActivity size={14} className="text-white/20" />
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Neural Status</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{status === 'connected' ? 'Established' : 'Disconnected'}</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/20">Latency: 42ms</span>
                </div>
              </div>
            </div>
          </div>

          <div className="app-section-card glass !bg-accent/5 !border-accent/10">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-accent">
                  <IconBolt size={32} />
                </div>
                <div>
                  <h2>Engagement</h2>
                </div>
              </div>
            </div>
            
            <div className="app-section-content">
              <p className="text-xs text-white/40 leading-relaxed font-medium mb-6">
                AI will automatically respond to audience questions after 12 seconds of human silence.
              </p>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Autopilot Mode</span>
                  <Toggle value={true} onChange={() => {}} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
