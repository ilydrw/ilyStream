import React, { useState, useEffect } from 'react'
import {IconActivity, IconBolt, IconMicrophone, IconGhost, IconMessage, IconSend, IconPlayerPlay, IconTerminal2} from '@tabler/icons-react'
import { motion, AnimatePresence } from 'framer-motion'
import { resolveAppSettings, type AppSettings } from '../../../shared/app-settings'
import { useConnectionStore } from '../../stores/connection-store'

interface ServiceStatus {
  name: string
  id: string
  status: 'connected' | 'disconnected' | 'connecting'
  icon: React.ReactNode
}

interface LogEntry {
  id: string
  timestamp: string
  source: string
  message: string
  type: 'event' | 'action' | 'system'
}

function deriveServices(settings: AppSettings): ServiceStatus[] {
  return [
    { id: 'voicemod', name: 'Voicemod', status: settings.voicemodEnabled ? 'connected' : 'disconnected', icon: <IconMicrophone size={16} /> },
    { id: 'vtube', name: 'VTube Studio', status: settings.vtubeEnabled ? 'connected' : 'disconnected', icon: <IconGhost size={16} /> },
    { id: 'discord', name: 'Discord Webhook', status: settings.discordEnabled ? 'connected' : 'disconnected', icon: <IconMessage size={16} /> },
    { id: 'physics', name: 'Physics Engine', status: settings.physicsOverlayEnabled ? 'connected' : 'disconnected', icon: <IconBolt size={16} /> },
  ]
}

export function CommanderView() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { id: 'voicemod', name: 'Voicemod', status: 'disconnected', icon: <IconMicrophone size={16} /> },
    { id: 'vtube', name: 'VTube Studio', status: 'disconnected', icon: <IconGhost size={16} /> },
    { id: 'discord', name: 'Discord Webhook', status: 'disconnected', icon: <IconMessage size={16} /> },
    { id: 'physics', name: 'Physics Engine', status: 'disconnected', icon: <IconBolt size={16} /> },
  ])

  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', timestamp: new Date().toLocaleTimeString(), source: 'System', message: 'Engine Monitoring Active', type: 'system' },
  ])

  useEffect(() => {
    if (!window.api?.settings) return

    void window.api.settings.getAll().then((raw: any) => {
      const s = resolveAppSettings(raw)
      setServices(deriveServices(s))
    })

    const unsubSettings = window.api.on('settings:changed', (raw: unknown) => {
      const s = resolveAppSettings(raw as Record<string, unknown>)
      setServices(deriveServices(s))
    })

    const unsubEvents = window.api.on('event:stream', (event: any) => {
      const name = event.user?.displayName || event.user?.username || 'Unknown'
      let message = ''
      switch (event.type) {
        case 'chat': message = `${name}: ${String(event.message ?? '').slice(0, 80)}`; break
        case 'gift': message = `Gift received: ${event.giftName ?? 'gift'} (x${event.giftCount ?? 1}) from ${name}`; break
        case 'follow': message = `New follower: ${name}`; break
        case 'like': message = `${name} liked (x${event.likeCount ?? 1})`; break
        case 'share': message = `${name} shared the live`; break
        default: message = `${name} triggered ${event.type ?? 'event'}`; break
      }

      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        source: String(event.platform ?? 'system').charAt(0).toUpperCase() + String(event.platform ?? 'system').slice(1),
        message,
        type: event.type === 'chat' ? 'event' : 'action'
      }
      setLogs(prev => [entry, ...prev.slice(0, 19)])
    })

    return () => {
      unsubSettings()
      unsubEvents()
    }
  }, [])

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Top IconGridDots: Service Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {services.map((service) => (
          <div key={service.id} className="app-section-card glass flex flex-col items-start gap-4 hover:bg-white/[0.02] transition-all group !p-8">
            <div className={`flex items-center justify-center transition-all ${service.status === 'connected' ? 'text-accent' : 'text-white/20'}`}>
              {React.cloneElement(service.icon as React.ReactElement, { size: 32 })}
            </div>
            <div className="w-full">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">{service.name}</p>
                <div className={`h-1.5 w-1.5 rounded-full ${service.status === 'connected' ? 'bg-accent' : 'bg-white/10'}`} />
              </div>
              <p className="text-xl font-black text-white tracking-tight uppercase italic opacity-40">{service.status}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
        {/* Left Column: Log Feed */}
        <div className="lg:col-span-2 space-y-10">
          <div className="app-section-card glass flex flex-col h-[600px]">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-accent">
                  <IconTerminal2 size={32} />
                </div>
                <div>
                  <h2 className="text-sm font-black tracking-tight">Automation Monitor</h2>
                  <p>Live event flow.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-[9px] font-black tracking-widest uppercase">
                 <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                 Active
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {logs.map((log) => (
                  <motion.div
                    key={log.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-start gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.04] transition-colors group"
                  >
                    <span className="text-[10px] font-mono text-white/20 pt-1 w-16 shrink-0">{log.timestamp}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${
                          log.type === 'event' ? 'text-blue-400' : 
                          log.type === 'action' ? 'text-accent' : 'text-white/40'
                        }`}>
                          {log.source}
                        </span>
                        <div className="h-px flex-1 bg-white/[0.05]" />
                      </div>
                      <p className="text-sm text-white/70 leading-relaxed font-medium">
                        {log.message}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="p-4 border-t border-white/5 bg-black/20 flex items-center justify-between">
               <p className="text-[10px] font-black uppercase text-white/20 tracking-widest">Buffer: {logs.length}/20 Events</p>
               <button className="text-[10px] font-black uppercase text-accent tracking-widest hover:brightness-125 transition-all">Clear Stream</button>
            </div>
          </div>
        </div>

        {/* Right Column: Quick Actions & Diagnostics */}
        <div className="space-y-12">
          <div className="app-section-card glass">
             <div className="app-section-head">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center text-accent">
                    <IconBolt size={32} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black tracking-tight">Service Testing</h2>
                    <p>Manual triggers.</p>
                  </div>
                </div>
             </div>
             <div className="app-section-content">
               <div className="grid grid-cols-1 gap-3">
                  <QuickActionButton 
                    icon={<IconMicrophone size={14} />} 
                    label="Test Voicemod" 
                    description="Apply 'Demon' Voice for 5s"
                    onClick={() => {}}
                  />
                  <QuickActionButton 
                    icon={<IconGhost size={14} />} 
                    label="VTube Wave" 
                    description="Trigger Animation Hotkey"
                    onClick={() => {}}
                  />
                  <QuickActionButton 
                    icon={<IconMessage size={14} />} 
                    label="Discord Ping" 
                    description="Send Test Webhook"
                    onClick={() => {}}
                  />
                   <QuickActionButton 
                    icon={<IconSend size={14} />} 
                    label="Spawn Physics" 
                    description="Drop Test Item in Overlay"
                    onClick={() => {}}
                  />
               </div>
             </div>
          </div>

          <div className="app-section-card glass !p-0">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center text-accent">
                  <IconActivity size={32} />
                </div>
                <div>
                  <h2 className="text-sm font-black tracking-tight">Traffic Analyzer</h2>
                  <p>Real-time engine diagnostics.</p>
                </div>
              </div>
            </div>
            <div className="app-section-content">
              <div className="flex flex-col gap-6 relative z-10">
                <div className="space-y-1">
                   <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">
                      <span className="text-white/40">Event Saturation</span>
                      <span className="text-accent">Low</span>
                   </div>
                   <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-accent" 
                        initial={{ width: '0%' }}
                        animate={{ width: '24%' }}
                      />
                   </div>
                </div>
                <div className="space-y-1">
                   <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">
                      <span className="text-white/40">IPC Latency</span>
                      <span className="text-success">2.4ms</span>
                   </div>
                   <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-success" 
                        initial={{ width: '0%' }}
                        animate={{ width: '8%' }}
                      />
                   </div>
                </div>
                <div className="pt-4 border-t border-white/5">
                   <p className="text-[10px] text-white/40 leading-relaxed font-medium">
                     Current engine utilizing <span className="text-white">Tokio-based</span> async routing for zero-latency event processing.
                   </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickActionButton({ icon, label, description, onClick }: { 
  icon: React.ReactNode, 
  label: string, 
  description: string,
  onClick: () => void 
}) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-6 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-accent/30 transition-all text-left group"
    >
      <div className="text-white/40 group-hover:text-accent transition-all shrink-0">
        {React.cloneElement(icon as React.ReactElement, { size: 24 })}
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-white mb-0.5">{label}</p>
        <p className="text-[10px] font-medium text-white/30">{description}</p>
      </div>
    </button>
  )
}
