import React, { useState, useEffect, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Wifi, 
  ExternalLink,
  Cpu,
  ArrowRight,
  Radio,
  Activity,
  Check
} from 'lucide-react'
import { useHueStore, HueBridge, HueLight } from '../../stores/hue-store'
import { HueIcon } from '../../components/ui/HueIcon'
import { HueBulbIcon } from '../../components/ui/HueBulbIcon'
import { Toggle } from '../../components/ui/Inputs'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../../shared/app-settings'

export default function HuePage() {
  const { 
    isConnected, 
    isDiscovering, 
    isSafetyLocked,
    bridgeIp, 
    username, 
    lights,
    groups,
    selectedLightIds,
    discoverBridges,
    connect,
    setSafetyLock,
    toggleLightSelection,
    fetchLights,
    triggerFlash,
    syncStatus,
    setUsername: storeSetUsername,
    triggerStrobe
  } = useHueStore()

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)

  const [discoveredBridges, setDiscoveredBridges] = useState<HueBridge[]>([])
  const [localUsername, setLocalUsername] = useState(username || '')
  const [manualIp, setManualIp] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isTestFlashing, setIsTestFlashing] = useState(false)

  useEffect(() => {
    if (!window.api?.settings) return

    syncStatus()

    void window.api.settings.getAll().then((all: AppSettings) => {
      setSettings(all)
    })

    const settingsUnsubscribe = window.api.on('settings:changed', (nextSettings: unknown) => {
      setSettings(nextSettings as AppSettings)
    })

    // Auto-refresh lights every 5 seconds while on this page
    const interval = setInterval(() => {
      if (useHueStore.getState().isConnected) {
        fetchLights()
      }
    }, 5000)

    return () => {
      clearInterval(interval)
      settingsUnsubscribe()
    }
  }, [])
  
  useEffect(() => {
    if (username) {
      setLocalUsername(username)
    }
  }, [username])

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    await window.api.settings.set(key, value)
  }

  const handleDiscover = async () => {
    setError(null)
    const bridges = await discoverBridges()
    setDiscoveredBridges(bridges)
    if (bridges.length === 0) {
      setError('No bridges found automatically. Please try entering your Bridge IP address manually below.')
    }
  }

  const handleConnect = async (ip: string) => {
    const targetIp = ip || manualIp
    if (!targetIp) {
      setError('Please provide a Bridge IP address.')
      return
    }
    if (!localUsername) {
      setError('Please enter a Hue Bridge username.')
      return
    }

    setIsConnecting(true)
    setError(null)
    try {
      const success = await connect(targetIp, localUsername)
      if (!success) {
        setError('Failed to connect to the bridge at ' + targetIp + '. Check the IP and ensure the Bridge is powered on.')
      }
    } catch (err: any) {
      setError(`Technical error during connection: ${err.message || 'Unknown error'}`)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleTestFlash = async () => {
    setIsTestFlashing(true)
    if (triggerStrobe) {
      await triggerStrobe(settings.hueFlashDurationMs)
    } else {
      await triggerFlash()
    }
    setTimeout(() => setIsTestFlashing(false), settings.hueFlashDurationMs)
  }

  const renderLightCard = (light: HueLight) => {
    const isSelected = selectedLightIds.includes(light.id)
    return (
      <button 
        key={light.id} 
        onClick={() => toggleLightSelection(light.id)}
        className={`flex items-center gap-4 p-4 rounded-2xl text-left transition-all border ${
          isSelected 
            ? 'border-white/20 text-white' 
            : 'bg-white/[0.01] border-white/[0.03] hover:bg-white/[0.03] hover:border-white/10'
        }`}
        style={isSelected ? { background: 'var(--brand-gradient)' } : {}}
      >
        <div 
          className="w-10 h-10 flex items-center justify-center transition-all"
          style={light.on ? { 
            color: light.color || '#ffffff'
          } : { color: 'rgba(255,255,255,0.1)' }}
        >
          <HueBulbIcon size={32} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-white'}`}>{light.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${light.reachable ? (isSelected ? 'bg-white' : 'bg-emerald-500') : (isSelected ? 'bg-white/50' : 'bg-red-500')}`} />
            <span className={`text-[10px] font-bold tracking-widest ${isSelected ? 'text-white/70' : 'text-white/20'}`}>
              {light.reachable ? 'Online' : 'Unreachable'}
            </span>
          </div>
        </div>
        {isSelected && (
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white">
            <Check size={12} strokeWidth={4} />
          </div>
        )}
      </button>
    )
  }

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <HueIcon size={48} />
          </div>
          <div>
            <div className="app-header-eyebrow">
              <Cpu size={14} className="text-accent" />
              <span>Service Integration</span>
            </div>
            <h1>Philips Hue</h1>
            <p className="app-page-intro">
              Connect and synchronize your smart lighting with live stream events. 
              Automate visual alerts for follows, gifts, and subscriptions.
            </p>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Metric 
          icon={<Radio size={20} />} 
          label="Bridge Status" 
          value={isConnected ? 'CONNECTED' : 'OFFLINE'} 
          sub={isConnected ? 'Active Network Node' : 'Searching for Bridge...'}
          accent={isConnected ? 'text-success' : 'text-danger'}
        />
        <Metric 
          icon={<HueBulbIcon size={22} />} 
          label="Active Lights" 
          value={lights.filter(l => l.reachable).length.toString()} 
          sub="Discovered Units"
          accent="text-amber-400"
        />
        <Metric 
          icon={<Activity size={20} />} 
          label="Event Sync" 
          value="ENABLED" 
          sub="Automated Triggers"
          accent="text-blue-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Configuration */}
        <div className="lg:col-span-5 space-y-10">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center">
                  <HueIcon size={32} />
                </div>
                <div>
                  <h2>Bridge Configuration</h2>
                  <p>Credentials and network address.</p>
                </div>
              </div>
              <button 
                onClick={handleDiscover}
                disabled={isDiscovering}
                className="app-button !h-10 !px-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
              >
                <RefreshCw size={12} className={isDiscovering ? 'animate-spin' : ''} />
                {isDiscovering ? 'Scanning...' : 'Scan Network'}
              </button>
            </div>

            <div className="p-8 space-y-6 bg-white/[0.01]">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black tracking-widest text-white/30">Bridge Username</label>
                <input
                  type="password"
                  placeholder="Paste your Hue username..."
                  value={localUsername}
                  onChange={(e) => {
                    setLocalUsername(e.target.value)
                    storeSetUsername(e.target.value)
                  }}
                  className="app-input"
                />
                <a 
                  href="https://developers.meethue.com/develop/get-started-2/" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-400/60 hover:text-blue-400 uppercase tracking-wider mt-1 transition-colors"
                >
                  How to get a username? <ExternalLink size={10} />
                </a>
              </div>

              {(!isConnected || !bridgeIp) ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black tracking-widest text-white/30">Bridge IP Address</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 192.168.1.50"
                      value={manualIp}
                      onChange={(e) => setManualIp(e.target.value)}
                      className="app-input flex-1"
                    />
                    <button
                      onClick={() => handleConnect('')}
                      disabled={isConnecting || !manualIp}
                      className="app-button-primary !h-11 px-6 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      {isConnecting ? '...' : 'Connect'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black tracking-widest text-white/30">Active IP Address</label>
                  <div className="app-input opacity-50 bg-black/20">{bridgeIp}</div>
                </div>
              )}
            </div>

            {error && (
              <div className="px-8 py-4 bg-danger/10 border-y border-danger/20">
                <p className="text-xs font-bold text-danger leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 p-6 border-t border-white/5 mt-auto">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-white/10'}`} />
                <p className="text-xs font-bold tracking-widest text-white/40">
                  {isConnected ? 'Bridge is Active' : 'Standby'}
                </p>
              </div>

              <button 
                onClick={handleTestFlash}
                disabled={!isConnected || isTestFlashing}
                className="app-button-primary !h-10 !px-8 text-xs font-bold disabled:opacity-30"
              >
                {isTestFlashing ? 'Strobing...' : 'Test Sync'}
              </button>
            </div>
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head border-b border-white/[0.03]">
              <div className="flex items-center gap-4">
                <Zap size={20} className="text-blue-400" />
                <div>
                  <h2>Event Triggers</h2>
                  <p>Automated lighting effects for stream events.</p>
                </div>
              </div>
            </div>
            
            <div className="p-8 space-y-8 bg-white/[0.01]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white mb-1">Flash on Follow</div>
                  <div className="text-[10px] font-bold text-white/20 tracking-widest">Rapid white strobe on new follower</div>
                </div>
                <Toggle value={settings.hueFlashOnFollow} onChange={(val) => updateSetting('hueFlashOnFollow', val)} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white mb-1">Flash on Gift</div>
                  <div className="text-[10px] font-bold text-white/20 tracking-widest">Rapid white strobe on gifts</div>
                </div>
                <Toggle value={settings.hueFlashOnGift} onChange={(val) => updateSetting('hueFlashOnGift', val)} />
              </div>

              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black tracking-widest text-white/30">Flash Duration</div>
                  <div className="text-xs font-mono font-bold text-blue-400">{settings.hueFlashDurationMs}ms</div>
                </div>
                <input 
                  type="range"
                  min={500}
                  max={15000}
                  step={500}
                  value={settings.hueFlashDurationMs}
                  onChange={(e) => updateSetting('hueFlashDurationMs', parseInt(e.target.value))}
                  className="app-range"
                />
                <div className="flex justify-between text-[10px] font-bold text-white/10 tracking-widest">
                  <span>0.5s</span>
                  <span>15s</span>
                </div>
              </div>
            </div>
          </section>

          {/* Discovery List */}
          {!isConnected && (
            <section className="app-section-card glass animate-in">
              <div className="app-section-head">
                <div>
                  <h2>Discovered Bridges</h2>
                  <p>Bridges found on your local network.</p>
                </div>
              </div>
              <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                {discoveredBridges.length > 0 ? (
                  discoveredBridges.map((bridge) => (
                    <button
                      key={bridge.id}
                      onClick={() => handleConnect(bridge.internalipaddress)}
                      disabled={isConnecting}
                      className="w-full group flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-all text-left"
                    >
                      <div className="flex items-center gap-4">
                        <Wifi size={18} className="text-blue-400/50" />
                        <div>
                          <div className="text-sm font-bold text-white">Hue Bridge {bridge.id.slice(-4)}</div>
                          <div className="text-[10px] font-mono text-white/20 tracking-widest">{bridge.internalipaddress}</div>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-white/10 group-hover:text-blue-400 transition-colors" />
                    </button>
                  ))
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4 text-white/10">
                      <Search size={24} />
                    </div>
                    <p className="text-xs font-bold text-white/20 tracking-widest mb-4">No Bridges Found</p>
                    <button 
                      onClick={handleDiscover}
                      disabled={isDiscovering}
                      className="app-button-primary !h-10 !px-6 text-xs font-bold"
                    >
                      {isDiscovering ? 'Searching...' : 'Scan Local Network'}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Lights Dashboard */}
        <div className="lg:col-span-7">
          <section className="app-section-card glass h-full flex flex-col">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center">
                  <HueBulbIcon size={26} className="text-amber-400" />
                </div>
                <div>
                  <h2>Connected Lights</h2>
                  <p>Status of your synchronized hardware.</p>
                </div>
              </div>
              {isConnected && (
                <button 
                  onClick={fetchLights}
                  className="text-[10px] font-bold text-blue-400/60 hover:text-blue-400 tracking-widest transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={10} />
                  Refresh
                </button>
              )}
            </div>

            <div className="flex-1 p-8 bg-white/[0.01] overflow-y-auto custom-scrollbar">
              {lights.length > 0 ? (
                <div className="space-y-10">
                  {/* Lights by Room */}
                  {(() => {
                    // Use standard rooms and zones for grouping
                    const roomGroups = (groups || []).filter(g => g.type === 'Room');
                    const lightsInRooms = new Set();
                    
                    const roomsWithLights = roomGroups
                      .map(room => {
                        const roomLights = lights
                          .filter(l => room.lights.includes(l.id))
                          .sort((a, b) => a.name.localeCompare(b.name));
                        
                        roomLights.forEach(l => lightsInRooms.add(l.id));
                        return { ...room, lights: roomLights };
                      })
                      .filter(room => room.lights.length > 0)
                      .sort((a, b) => a.name.localeCompare(b.name));

                    const unassignedLights = lights
                      .filter(l => !lightsInRooms.has(l.id))
                      .sort((a, b) => a.name.localeCompare(b.name));

                    return (
                      <>
                        {roomsWithLights.map((room) => (
                          <div key={room.id} className="space-y-4">
                            <div className="flex items-center gap-4 px-2">
                              <h3 className="text-xs font-black tracking-[0.2em] text-white/40">{room.name}</h3>
                              <div className="h-px flex-1 bg-white/[0.05]" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {room.lights.map((light) => renderLightCard(light))}
                            </div>
                          </div>
                        ))}

                        {unassignedLights.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-4 px-2">
                              <h3 className="text-xs font-black tracking-[0.2em] text-white/40">Unassigned</h3>
                              <div className="h-px flex-1 bg-white/[0.05]" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {unassignedLights.map((light) => renderLightCard(light))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="py-24 flex flex-col items-center justify-center text-center text-white/10 border border-dashed border-white/5 rounded-3xl bg-black/10">
                  <HueBulbIcon size={54} className="mb-4 opacity-10" />
                  <p className="text-sm font-medium">Connect a bridge to see your lights.</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-blue-400" />
                <span className="text-[10px] font-bold text-white/30 tracking-widest">Auto-Flash Engine: Active</span>
              </div>
              <div className="text-[10px] font-mono text-white/10 tracking-widest">
                Hue REST Core
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon, label, value, sub, accent = 'text-accent' }: { icon: any; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="app-section-card glass !p-6 hover:border-white/10 transition-all group">
      <div className={`mb-3 transition-colors duration-300 ${accent}`}>{icon}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">{label}</div>
      <div className="text-xl font-black text-white tabular-nums leading-none mb-1">{value}</div>
      {sub && <div className="text-[9px] font-black text-white/10 uppercase tracking-wider">{sub}</div>}
    </div>
  )
}
