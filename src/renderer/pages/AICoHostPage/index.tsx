import { useState, useEffect } from 'react'
import { IconCpu, IconBolt, IconKey, IconWorld, IconMessage, IconActivity, IconTerminal2 } from '@tabler/icons-react'
import { IconPower } from '../../components/ui/icons'
import { toast } from '../../components/ui/Toast'
import { resolveAppSettings, type AppSettings } from '../../../shared/app-settings'
import type { StreamInsightSnapshot } from '../../../shared/stream-insights'
import { AICoHostIcon } from '../../components/ui/icons/AICoHostIcon'

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
        toast.success('Neural link established')
        setStatus('connected')
      } else {
        toast.error(`Neural link failed: ${response.error}`)
        setStatus('error')
      }
    } catch (err: any) {
      toast.error(`System error: ${err.message}`)
      setStatus('error')
    } finally {
      setIsTesting(false)
    }
  }

  if (!settings) return null

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="app-page-title-cluster">
          <div className="app-page-title-icon">
            <AICoHostIcon size={24} className="object-contain" />
          </div>
          <div className="app-page-title-copy">
            <div className="app-page-title-kicker">Rules</div>
            <h1>AI co-host</h1>
          </div>
        </div>

        <div className="app-page-actions">
          <button
            onClick={() => {
              onUpdate('aiEnabled', !settings.ai.enabled)
              toast.info(settings.ai.enabled ? 'AI agent standby' : 'AI agent activated')
            }}
            className={settings.ai.enabled ? 'app-button-primary' : 'app-button'}
          >
            <IconPower size={14} />
            {settings.ai.enabled ? 'Agent active' : 'Agent bypassed'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4">
        {/* Main Configuration */}
        <div className="col-span-8 flex flex-col gap-4">
          <div className="app-section-card glass">
            <div className="app-section-head">
              <div className="flex items-center gap-3">
                <IconWorld size={16} className="text-accent" />
                <h2>Brain provider</h2>
              </div>
            </div>

            <div className="app-section-content !pt-0">
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-white/55">Endpoint URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={settings.ai.endpoint || ''}
                        onChange={(e) => onUpdate('aiEndpoint', e.target.value)}
                        placeholder="http://localhost:11434/"
                        className="app-input flex-1"
                      />
                      <button
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        className={isTesting ? 'app-button opacity-60 cursor-wait' : 'app-button-primary'}
                      >
                        {isTesting ? 'Testing…' : 'Ping'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-medium text-white/55">Access key</label>
                    <div className="relative">
                      <IconKey size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/32" />
                      <input
                        type="password"
                        value={settings.ai.apiKey || ''}
                        onChange={(e) => onUpdate('aiApiKey', e.target.value)}
                        placeholder="••••••••••••••••"
                        className="app-input w-full pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-white">Neural persona</h3>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.04] text-white/55">
                      <IconMessage size={12} className="text-accent" />
                      <span className="text-[11px] font-medium">Active template: Custom</span>
                    </div>
                  </div>

                  <textarea
                    value={settings.ai.systemPrompt}
                    onChange={(e) => onUpdate('aiSystemPrompt', e.target.value)}
                    className="app-input w-full !p-4 text-[13px] leading-relaxed min-h-[240px] resize-none custom-scrollbar"
                    placeholder="You are a witty AI co-host named ILY..."
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Intelligence Metrics */}
        <div className="col-span-4 flex flex-col gap-4">
          <div className="app-section-card glass">
            <div className="app-section-head">
              <div className="flex items-center gap-3">
                <IconCpu size={16} className="text-accent" />
                <h2>Parameters</h2>
              </div>
            </div>

            <div className="app-section-content !pt-0">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-medium text-white/55">Response depth</span>
                    <span className="text-[11px] font-mono text-accent tabular-nums">{settings.ai.maxTokens} tokens</span>
                  </div>
                  <input
                    type="range" min="64" max="4096" step="64"
                    value={settings.ai.maxTokens}
                    onChange={(e) => onUpdate('aiMaxTokens', parseInt(e.target.value))}
                    className="w-full h-1 bg-white/[0.05] rounded-full appearance-none cursor-pointer accent-[#19c8ff]"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-medium text-white/55">Temperature</span>
                    <span className="text-[11px] font-mono text-accent tabular-nums">0.7</span>
                  </div>
                  <input
                    type="range" min="0" max="1" step="0.1" value="0.7"
                    className="w-full h-1 bg-white/[0.05] rounded-full appearance-none cursor-pointer accent-[#19c8ff]"
                  />
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/[0.05]">
                <div className="flex items-center gap-2 mb-2.5">
                  <IconActivity size={13} className="text-white/55" />
                  <span className="text-[11px] font-medium text-white/55">Neural status</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-white/[0.025]">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-success animate-pulse' : 'bg-danger'}`} />
                    <span className="text-[12px] font-medium text-white">{status === 'connected' ? 'Established' : 'Disconnected'}</span>
                  </div>
                  <span className="text-[11px] font-mono text-white/55 tabular-nums">42ms</span>
                </div>
              </div>
            </div>
          </div>

          <div className="app-section-card glass">
            <div className="app-section-head">
              <div className="flex items-center gap-3">
                <IconBolt size={16} className="text-accent" />
                <h2>Engagement</h2>
              </div>
            </div>

            <div className="app-section-content !pt-0">
              <div className="grid grid-cols-3 gap-2 mb-4">
                <InsightStat label="Chat/min" value={insights?.chatPerMinute?.toFixed(1) ?? '0.0'} />
                <InsightStat label="Active" value={String(insights?.activeViewers ?? 0)} />
                <InsightStat label="Trend" value={insights?.trend ?? 'quiet'} />
              </div>

              <div className="flex flex-col gap-3">
                <div className="p-3 rounded-md bg-white/[0.025]">
                  <div className="flex items-start gap-2.5">
                    <IconTerminal2 size={14} className="mt-0.5 text-accent shrink-0" />
                    <p className="text-[13px] text-white/55 leading-relaxed">
                      {insights?.recommendation || 'Waiting for stream events before recommending the next move.'}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-md bg-white/[0.025]">
                  <p className="text-[11px] font-medium text-white/55 mb-2">Top terms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(insights?.topTerms.length ? insights.topTerms : ['waiting']).map((term) => (
                      <span key={term} className="rounded bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-white/55">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-md bg-white/[0.025]">
                  <p className="text-[11px] font-medium text-white/55 mb-2">Top chatters</p>
                  <div className="flex flex-col gap-1.5">
                    {(insights?.topChatters.length ? insights.topChatters : []).map((chatter) => (
                      <div key={`${chatter.platform}:${chatter.username}`} className="flex items-center justify-between text-[12px]">
                        <span className="font-medium text-white">{chatter.displayName}</span>
                        <span className="font-mono text-white/55 tabular-nums">{chatter.count}</span>
                      </div>
                    ))}
                    {!insights?.topChatters.length && (
                      <p className="text-[12px] font-normal text-white/32">No chatter data yet.</p>
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
    <div className="rounded-md bg-white/[0.025] p-2.5">
      <p className="text-[11px] font-medium text-white/55 leading-none">{label}</p>
      <p className="mt-1.5 truncate text-[16px] font-semibold text-white tabular-nums tracking-tight leading-none">{value}</p>
    </div>
  )
}
