import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {IconRobot, IconCpu, IconBolt, IconKey, IconWorld, IconMessage, IconPower, IconActivity, IconTerminal2} from '@tabler/icons-react'
import { toast } from '../../components/ui/Toast'
import { resolveAppSettings, type AppSettings } from '../../../shared/app-settings'
import type { StreamInsightSnapshot } from '../../../shared/stream-insights'
import AICoHostIcon from '../../assets/ai-co-host.svg'

export default function AICoHostPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected')
  const [insights, setInsights] = useState<StreamInsightSnapshot | null>(null)

  useEffect(() => {
    if (!window.api?.settings) {
      setSettings(resolveAppSettings())
      return
    }

    window.api.settings.getAll().then((s: any) => {
      setSettings(resolveAppSettings(s))
    })

    const unsubscribe = window.api.on('settings:changed', (s: any) => {
      setSettings(resolveAppSettings(s))
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!window.api?.ai?.getStreamInsights) return

    let cancelled = false
    const refresh = async () => {
      try {
        const nextInsights = await window.api.ai.getStreamInsights()
        if (!cancelled) setInsights(nextInsights)
      } catch {
        if (!cancelled) setInsights(null)
      }
    }

    void refresh()
    const interval = window.setInterval(refresh, 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const onUpdate = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (!settings) return
    setSettings((prev) => (prev ? { ...prev, [key]: value } : null))
    void window.api?.settings?.set?.(key as string, value)
  }

  const handleTestConnection = async () => {
    if (!window.api?.ai) {
      toast.error('AI bridge is only available in the Electron app')
      return
    }

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
              onUpdate('aiEnabled', !settings.ai.enabled)
              toast.info(settings.ai.enabled ? 'AI Agent Standby' : 'AI Agent Activated')
            }}
            className={`app-button !h-12 !px-8 !text-[10px] font-black tracking-[0.2em] transition-all ${
              settings.ai.enabled ? 'bg-brand-gradient text-white shadow-glow' : 'bg-white/5 text-white/40 border-white/10'
            }`}
          >
            <IconPower size={16} />
            {settings.ai.enabled ? 'AGENT ACTIVE' : 'AGENT BYPASSED'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8 mt-12">
        {/* Main Configuration */}
        <div className="col-span-8 space-y-8">
          <div className="app-section-card glass">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-[#d035f1]">
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
                        value={settings.ai.endpoint || ''}
                        onChange={(e) => onUpdate('aiEndpoint', e.target.value)}
                        placeholder="http://localhost:11434/"
                        className="flex-1 h-12 bg-black/40 border border-white/5 rounded-2xl px-5 text-sm font-medium outline-none focus:border-[#d035f1]/40 transition-all"
                      />
                      <button
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        className={`h-12 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          isTesting ? 'bg-white/5 text-white/20' : 'bg-brand-gradient text-white shadow-glow'
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
                        value={settings.ai.apiKey || ''}
                        onChange={(e) => onUpdate('aiApiKey', e.target.value)}
                        placeholder="••••••••••••••••"
                        className="w-full h-12 bg-black/40 border border-white/5 rounded-2xl pl-12 pr-5 text-sm font-medium outline-none focus:border-[#d035f1]/40 transition-all"
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
                      <IconMessage size={14} className="text-[#d035f1]" />
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Active Template: Custom</span>
                    </div>
                  </div>

                  <textarea
                    value={settings.ai.systemPrompt}
                    onChange={(e) => onUpdate('aiSystemPrompt', e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-3xl p-8 text-sm leading-relaxed font-medium outline-none focus:border-[#d035f1]/40 min-h-[280px] resize-none custom-scrollbar transition-all"
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
                <div className="flex items-center justify-center text-[#d035f1]">
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
                    <span className="text-[10px] font-mono text-[#d035f1]">{settings.ai.maxTokens} tokens</span>
                  </div>
                  <input
                    type="range" min="64" max="4096" step="64"
                    value={settings.ai.maxTokens}
                    onChange={(e) => onUpdate('aiMaxTokens', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-[#d035f1]"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Temperature</span>
                    <span className="text-[10px] font-mono text-[#d035f1]">0.7</span>
                  </div>
                  <input
                    type="range" min="0" max="1" step="0.1" value="0.7"
                    className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-[#d035f1]"
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

          <div className="app-section-card glass !bg-[#d035f1]/5 !border-[#d035f1]/10">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-[#d035f1]">
                  <IconBolt size={32} />
                </div>
                <div>
                  <h2>Engagement</h2>
                </div>
              </div>
            </div>

            <div className="app-section-content">
              <div className="grid grid-cols-3 gap-3 mb-6">
                <InsightStat label="Chat/Min" value={insights?.chatPerMinute?.toFixed(1) ?? '0.0'} />
                <InsightStat label="Active" value={String(insights?.activeViewers ?? 0)} />
                <InsightStat label="Trend" value={insights?.trend ?? 'quiet'} />
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-start gap-3">
                    <IconTerminal2 size={15} className="mt-0.5 text-[#d035f1]" />
                    <p className="text-xs text-white/50 leading-relaxed font-medium">
                      {insights?.recommendation || 'Waiting for stream events before recommending the next move.'}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-3">Top Terms</p>
                  <div className="flex flex-wrap gap-2">
                    {(insights?.topTerms.length ? insights.topTerms : ['waiting']).map((term) => (
                      <span key={term} className="rounded-xl border border-white/5 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/45">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-black/30 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-3">Top Chatters</p>
                  <div className="space-y-2">
                    {(insights?.topChatters.length ? insights.topChatters : []).map((chatter) => (
                      <div key={`${chatter.platform}:${chatter.username}`} className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white/55">{chatter.displayName}</span>
                        <span className="font-mono text-white/25">{chatter.count}</span>
                      </div>
                    ))}
                    {!insights?.topChatters.length && (
                      <p className="text-xs font-medium text-white/25">No chatter data yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InsightStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/20">{label}</p>
      <p className="mt-2 truncate text-sm font-black text-white/70">{value}</p>
    </div>
  )
}

