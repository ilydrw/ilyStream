import React, { useState, useEffect } from 'react'
import {IconCpu, IconRadio, IconActivity, IconExternalLink, IconRefresh, IconUnlink, IconCircleCheck, IconAlertCircle, IconLoader2, IconBulb, IconCheck} from '@tabler/icons-react'
import { GoveeIcon } from '../../components/ui/GoveeIcon'
import { toast } from '../../components/ui/Toast'

export default function GoveePage() {
  const [apiKey, setApiKey] = useState('')
  const [isLinking, setIsLinking] = useState(false)
  const [status, setStatus] = useState<{
    isConnected: boolean
    apiKey: string | null
    deviceCount: number
    cloudDeviceCount?: number
    lanDeviceCount?: number
    selectedDeviceIds?: string[]
  }>({
    isConnected: false,
    apiKey: null,
    deviceCount: 0,
    cloudDeviceCount: 0,
    lanDeviceCount: 0,
    selectedDeviceIds: []
  })
  const [devices, setDevices] = useState<any[]>([])
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [goveeSettings, setGoveeSettings] = useState({
    flashOnFollow: false,
    flashOnGift: false
  })

  useEffect(() => {
    if (!window.api?.govee) {
      console.error('[GoveePage] Govee API not found in preload script.')
      return
    }

    // Initial status fetch
    window.api.govee.getStatus().then((nextStatus: any) => {
      setStatus(nextStatus)
      setSelectedDeviceIds(nextStatus.selectedDeviceIds || [])
    })
    window.api.govee.getDevices().then(setDevices)

    const updateSettings = () => {
      setGoveeSettings({
        flashOnFollow: window.api?.settings?.getSync?.('goveeFlashOnFollow') || false,
        flashOnGift: window.api?.settings?.getSync?.('goveeFlashOnGift') || false
      })
    }
    updateSettings()

    // Listen for status changes
    const unsubscribeStatus = window.api.on('govee:status-changed', (newStatus: any) => {
      setStatus(newStatus)
      setSelectedDeviceIds(newStatus.selectedDeviceIds || [])
      if (newStatus.isConnected) {
        refreshDevices()
      }
    })

    const unsubscribeSettings = window.api.on('settings:changed', updateSettings)

    return () => {
      unsubscribeStatus()
      unsubscribeSettings()
    }
  }, [])

  const handleLink = async () => {
    if (!apiKey) return
    setIsLinking(true)
    try {
      const success = await window.api.govee?.connect(apiKey)
      if (success) {
        toast.success('Govee account linked successfully!')
        setApiKey('')
        refreshDevices()
      } else {
        toast.error('Failed to connect to Govee. IconCheck your API key.')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLinking(false)
    }
  }

  const handleDisconnect = async () => {
    if (confirm('Are you sure you want to unlink your Govee account?')) {
      await window.api.govee?.disconnect()
      setDevices([])
    }
  }

  const refreshDevices = async () => {
    setIsLoadingDevices(true)
    try {
      const list = await window.api.govee?.getDevices(true)
      setDevices(list || [])
    } finally {
      setIsLoadingDevices(false)
    }
  }

  const toggleDeviceSelection = async (device: any) => {
    const normalized = normalizeGoveeDeviceId(device.device)
    const selected = selectedDeviceIds.some((id) => normalizeGoveeDeviceId(id) === normalized)
    const next = selected
      ? selectedDeviceIds.filter((id) => normalizeGoveeDeviceId(id) !== normalized)
      : [...selectedDeviceIds, device.device]

    setSelectedDeviceIds(next)
    const nextStatus = await window.api.govee?.setSelectedDevices(next)
    if (nextStatus) {
      setStatus(nextStatus)
      setSelectedDeviceIds(nextStatus.selectedDeviceIds || next)
    }
  }

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <GoveeIcon size={48} />
          </div>
          <div>
            <h1>Govee Home</h1>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Metric 
          icon={status.isConnected ? <IconCircleCheck size={20} /> : <IconRadio size={20} />} 
          label="API Status" 
          value={status.isConnected ? 'CONNECTED' : 'NOT LINKED'} 
          sub={status.isConnected ? `Linked: ${status.apiKey}` : "Cloud Connection Idle"}
          accent={status.isConnected ? 'text-emerald-400' : 'text-danger'}
        />
        <Metric 
          icon={<GoveeIcon size={26} />} 
          label="Active Devices" 
          value={status.deviceCount.toString()} 
          sub={`Cloud ${status.cloudDeviceCount || 0} / LAN ${status.lanDeviceCount || 0}`}
          accent="text-accent"
        />
        <Metric 
          icon={<IconActivity size={20} />} 
          label="Event Sync" 
          value={status.isConnected ? 'READY' : 'DISABLED'} 
          sub="Live Interaction Link"
          accent={status.isConnected ? 'text-blue-400' : 'text-white/10'}
        />
      </div>

      {!window.api?.govee && (
        <div className="mb-12 p-8 rounded-3xl bg-danger/10 border border-danger/20 flex flex-col items-center text-center">
          <IconAlertCircle size={48} className="text-danger mb-4" />
          <h2 className="text-xl font-black text-white mb-2 uppercase tracking-tighter">System Restart Required</h2>
          <p className="text-sm text-white/40 max-w-md">
            The Govee integration service was just installed. Please restart the IlyStream application to initialize the background bridge.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Configuration */}
        <div className="lg:col-span-5 space-y-10">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center">
                  <GoveeIcon size={40} />
                </div>
                <div>
                  <h2>API Authentication</h2>
                </div>
              </div>
              {status.isConnected && (
                <button 
                  onClick={handleDisconnect}
                  className="p-2 rounded-lg bg-white/5 text-white/20 hover:text-danger hover:bg-danger/10 transition-all"
                  title="IconUnlink Account"
                >
                  <IconUnlink size={16} />
                </button>
              )}
            </div>

            <div className="p-8 space-y-6 bg-white/[0.01]">
              {!status.isConnected ? (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black tracking-widest text-white/30">Govee API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste your Govee Developer API Key..."
                      className="app-input"
                    />
                    <a 
                      href="https://developer.govee.com/reference/get-you-govee-api-key" 
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-400/60 hover:text-blue-400 uppercase tracking-wider mt-1 transition-colors"
                    >
                      Request an API Key <IconExternalLink size={10} />
                    </a>
                  </div>
                  
                  <button 
                    onClick={handleLink}
                    disabled={isLinking || !apiKey}
                    className="app-button-primary w-full !h-12 text-[10px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isLinking ? (
                      <>
                        <IconLoader2 size={14} className="animate-spin mr-2" />
                        Linking...
                      </>
                    ) : (
                      'Link Account'
                    )}
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-4">
                    <IconCircleCheck size={32} />
                  </div>
                  <h3 className="text-lg font-black text-white mb-2">Account Linked</h3>
                  <p className="text-xs text-white/40 mb-6 max-w-[200px]">
                    Your Govee account is synchronized. LAN discovery runs during refresh.
                  </p>
                  <div className="w-full h-px bg-white/5 mb-6" />
                  <button 
                    onClick={refreshDevices}
                    className="text-[10px] font-black text-accent uppercase tracking-widest hover:underline"
                  >
                    Sync Device IconList
                  </button>
                </div>
              )}
            </div>
          </section>

          <div className="p-6 rounded-2xl bg-blue-400/5 border border-blue-400/10 flex gap-4">
             <IconAlertCircle size={20} className="text-blue-400 shrink-0 mt-0.5" />
             <div>
               <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Developer Note</h4>
               <p className="text-[11px] text-blue-400/40 leading-relaxed">
                 Only selected Govee devices run alert effects. Select your H612F and leave roommate lights unselected.
               </p>
             </div>
          </div>

          {status.isConnected && (
            <section className="app-section-card glass animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="app-section-head">
                <div className="flex items-center gap-4">
                  <IconActivity size={20} className="text-accent" />
                  <div>
                    <h2>Event Triggers</h2>
                  </div>
                </div>
              </div>
              
              <div className="p-8 space-y-6 bg-white/[0.01]">
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                  <div>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider mb-0.5">Flash on Follow</h4>
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest">Strobe teal on new followers</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={goveeSettings.flashOnFollow}
                      onChange={(e) => window.api.settings.setMany({ goveeFlashOnFollow: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/20 after:border-transparent after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent/40 peer-checked:after:bg-white"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                  <div>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider mb-0.5">Flash on IconGift</h4>
                    <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest">Cyber strobe on gift events</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={goveeSettings.flashOnGift}
                      onChange={(e) => window.api.settings.setMany({ goveeFlashOnGift: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/20 after:border-transparent after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent/40 peer-checked:after:bg-white"></div>
                  </label>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={() => {
                      window.api.govee.testStrobe()
                      toast.success('Govee test strobe triggered!')
                    }}
                    className="w-full h-12 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2"
                  >
                    <IconActivity size={14} />
                    Test Trigger Effect
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Device IconList */}
        <div className="lg:col-span-7">
          <section className="app-section-card glass h-full flex flex-col min-h-[400px]">
            <div className="app-section-head">
              <div className="flex items-center gap-4">
                <h2>Discovered Devices</h2>
              </div>
              {status.isConnected && (
                <button 
                  onClick={refreshDevices}
                  disabled={isLoadingDevices}
                  className="text-[10px] font-bold text-blue-400/60 hover:text-blue-400 tracking-widest transition-colors flex items-center gap-2 disabled:opacity-30"
                >
                  <IconRefresh size={10} className={isLoadingDevices ? 'animate-spin' : ''} />
                  Refresh
                </button>
              )}
            </div>

            <div className="flex-1 p-8 bg-white/[0.01]">
              {!status.isConnected ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-white/10 border border-dashed border-white/5 rounded-3xl">
                  <GoveeIcon size={64} className="mb-4 opacity-10" />
                  <p className="text-sm font-medium">Link your Govee account to manage devices.</p>
                </div>
              ) : devices.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-white/10 border border-dashed border-white/5 rounded-3xl">
                   {isLoadingDevices ? (
                     <IconLoader2 size={32} className="animate-spin text-accent" />
                   ) : (
                     <>
                        <IconBulb size={48} className="mb-4 opacity-10" />
                        <p className="text-sm font-medium">No Govee devices found.</p>
                     </>
                   )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {devices.map((device: any) => {
                    const isSelected = selectedDeviceIds.some((id) => normalizeGoveeDeviceId(id) === normalizeGoveeDeviceId(device.device))
                    return (
                    <button
                      key={device.device}
                      onClick={() => toggleDeviceSelection(device)}
                      className={`p-4 rounded-2xl border flex items-center gap-4 text-left transition-all group ${
                        isSelected
                          ? 'bg-accent/10 border-accent/40'
                          : 'bg-white/[0.03] border-white/5 hover:border-accent/30'
                      }`}
                    >
                       <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                         isSelected ? 'bg-accent/15 text-accent' : 'bg-white/5 text-white/20 group-hover:text-accent'
                       }`}>
                         <IconBulb size={24} />
                       </div>
                       <div className="min-w-0">
                         <h4 className="text-[11px] font-black text-white truncate uppercase tracking-wider">{device.deviceName}</h4>
                         <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">
                           {device.model}{device.ip ? ` / ${device.ip}` : ''}
                         </p>
                       </div>
                       <div className="ml-auto text-[8px] font-black uppercase tracking-widest text-emerald-300/70">
                         {device.source || 'cloud'}
                       </div>
                       {isSelected ? (
                         <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-black">
                           <IconCheck size={12} strokeWidth={4} />
                         </div>
                       ) : (
                         <div className="w-2 h-2 rounded-full bg-emerald-500" />
                       )}
                    </button>
                  )})}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function normalizeGoveeDeviceId(deviceId?: string): string {
  return (deviceId || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
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
