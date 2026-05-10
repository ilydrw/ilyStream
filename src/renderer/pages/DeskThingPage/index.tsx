import { useEffect, useMemo, useState } from 'react'
import {IconDeviceMobile, IconPlus, IconTrash, IconCopy, IconCheck, IconClock, IconCpu, IconMusic, IconLayoutGrid} from '@tabler/icons-react'
import type { PairCode, PairedDevice } from '../../../shared/device-api'
import { DeskThingIcon } from '../../components/ui/DeskThingIcon'
import { CarThingIcon } from '../../components/ui/CarThingIcon'

export default function DeskThingPage() {
  const [devices, setDevices] = useState<PairedDevice[]>([])
  const [pair, setPair] = useState<PairCode | null>(null)
  const [pairExpiresIn, setPairExpiresIn] = useState(0)
  const [serverPort, setServerPort] = useState<number | null>(null)
  const [serverHost, setServerHost] = useState<string>('')
  const [copied, setCopied] = useState<'code' | 'url' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDevices = async () => {
    if (!window.api?.device) return
    try {
      const list = await window.api.device.listPaired()
      setDevices(list as PairedDevice[])
    } catch (err) {
      console.error('[DeskThing] IconList failed', err)
    }
  }

  const loadOverlayInfo = async () => {
    try {
      const status = await window.api?.overlay?.getStatus?.()
      if (status?.port) setServerPort(status.port)
    } catch {}
  }

  useEffect(() => {
    loadDevices()
    loadOverlayInfo()
    // Best-effort host detection — the device needs the desktop's LAN IP, not
    // localhost. We can't enumerate NICs from the renderer, so fall back to
    // the existing OBS host setting when it looks like a real LAN address.
    void window.api?.settings?.getAll().then((settings: any) => {
      if (settings?.obsHost && settings.obsHost !== '127.0.0.1' && settings.obsHost !== 'localhost') {
        setServerHost(settings.obsHost)
      }
    })
  }, [])

  // Tick the pair-code countdown
  useEffect(() => {
    if (!pair) return
    const update = () => {
      const remaining = Math.max(0, Math.ceil((new Date(pair.expiresAt).getTime() - Date.now()) / 1000))
      setPairExpiresIn(remaining)
      if (remaining === 0) setPair(null)
    }
    update()
    const interval = setInterval(update, 500)
    return () => clearInterval(interval)
  }, [pair])

  // While a code is active, refresh the device list more aggressively so the
  // newly-paired device appears the moment it completes.
  useEffect(() => {
    if (!pair) return
    const interval = setInterval(loadDevices, 2000)
    return () => clearInterval(interval)
  }, [pair])

  const startPair = async () => {
    setError(null)
    if (!window.api?.device) {
      setError('Device API unavailable')
      return
    }
    try {
      const code = await window.api.device.startPair()
      setPair(code as PairCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start pairing')
    }
  }

  const revokeDevice = async (token: string) => {
    if (!window.api?.device) return
    await window.api.device.revoke(token)
    await loadDevices()
  }

  const handleCopy = (value: string, kind: 'code' | 'url') => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(kind)
      setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500)
    })
  }

  const pairUrl = useMemo(() => {
    if (!serverPort) return null
    const host = serverHost || '<your-LAN-IP>'
    return `http://${host}:${serverPort}/api/v1/pair/complete`
  }, [serverHost, serverPort])

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <DeskThingIcon size={48} />
          </div>
          <div>
            <h1>ilyStream Service</h1>
            <p className="app-page-intro">
              Turn a Spotify Car Thing (or any LAN device running the DeskThing client) into a
              tactile soundboard and stream-deck remote for ilyStream.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end px-3">
            <span className="text-[10px] font-black tracking-widest text-white/20">Paired</span>
            <span className="text-2xl font-black tabular-nums text-white">{devices.length}</span>
          </div>
        </div>
      </header>

      {/* What this enables */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <FeatureCard
          icon={<IconMusic size={18} />}
          label="Sounds"
          description="Trigger any sound from your soundboard with a tap on the device."
        />
        <FeatureCard
          icon={<IconLayoutGrid size={18} />}
          label="Deck actions"
          description="Skip tracks, fire alerts, and run mid-stream actions without touching your PC."
        />
        <FeatureCard
          icon={<CarThingIcon size={20} />}
          label="LAN-only"
          description="Token-paired over your local network — nothing leaves the house."
        />
      </div>

      {/* Pair + paired list */}
      <section className="app-section-card glass">
        <div className="app-section-head">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center text-accent">
              <DeskThingIcon size={32} />
            </div>
            <div>
              <h2>Paired Devices</h2>
              <p>Devices currently authorized to control this ilyStream instance.</p>
            </div>
          </div>
          <button
            onClick={startPair}
            disabled={!!pair}
            className="app-button-primary !h-10 !px-6 text-xs font-bold flex items-center gap-2"
          >
            <IconPlus size={14} />
            Pair new device
          </button>
        </div>

        {pair && (
          <div className="p-8 border-t border-white/5 bg-white/[0.01]">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
              <div className="flex flex-col gap-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Enter this code on your device
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-5xl font-black font-mono tabular-nums text-accent tracking-[0.2em]">
                    {pair.code}
                  </div>
                  <button
                    onClick={() => handleCopy(pair.code, 'code')}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70 transition"
                    title="Copy code"
                  >
                    {copied === 'code' ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-white/40">
                  <IconClock size={11} />
                  Expires in {pairExpiresIn}s
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Pair endpoint
                </div>
                {pairUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-white/70 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2 truncate flex-1">
                      {pairUrl}
                    </code>
                    <button
                      onClick={() => handleCopy(pairUrl, 'url')}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70 transition shrink-0"
                    >
                      {copied === 'url' ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-white/40">Overlay server not running.</div>
                )}
                <p className="text-[11px] text-white/30 leading-relaxed">
                  On the device, POST <code className="text-white/50">{`{ code, label }`}</code> to this URL.
                  The response includes a long-lived token to use as <code className="text-white/50">Authorization: Bearer &lt;token&gt;</code>.
                  {!serverHost && ' Replace <your-LAN-IP> with the desktop\'s LAN address.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="px-8 py-3 border-t border-danger/20 bg-danger/5 text-xs text-danger">{error}</div>
        )}

        <div className="app-section-content !p-0">
          {devices.length === 0 ? (
            <div className="p-12 text-center text-sm text-white/30 italic">
              No paired devices yet. Click "Pair new device" to get started.
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.02]">
              {devices.map((device) => (
                <li
                  key={device.token}
                  className="flex items-center gap-12 px-12 py-10 hover:bg-white/[0.01] transition-all group"
                >
                  <div className="text-white/10 group-hover:text-white/40 transition-all shrink-0">
                    <CarThingIcon size={128} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-black text-white truncate mb-2">{device.label}</div>
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                      <div className="flex items-center gap-2.5 text-[11px] font-black uppercase tracking-widest text-white/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        ID: {device.token.slice(-8)}
                      </div>
                      <div className="flex items-center gap-2.5 text-[11px] font-black uppercase tracking-widest text-white/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
                        Added {formatRelative(device.createdAt)}
                      </div>
                      {device.lastUsed && (
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-accent/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent/30" />
                          Online {formatRelative(device.lastUsed)}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => revokeDevice(device.token)}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 text-white/30 hover:bg-danger/20 hover:text-danger transition-all opacity-0 group-hover:opacity-100"
                    title="Revoke device"
                  >
                    <IconTrash size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function FeatureCard({
  icon,
  label,
  description
}: {
  icon: React.ReactNode
  label: string
  description: string
}) {
  return (
    <div className="app-section-card glass !p-6">
      <div className="text-accent mb-3">{icon}</div>
      <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">{label}</div>
      <p className="text-xs text-white/60 leading-relaxed">{description}</p>
    </div>
  )
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return 'just now'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
