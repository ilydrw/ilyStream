import {IconMusic, IconPlayerSkipForward, IconTrash, IconUser, IconList, IconPlayerPlay} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { SpotifySongRequest, SpotifyStatus } from '../../../shared/spotify-types'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../../shared/app-settings'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import { SpotifyIcon } from '../../components/ui/SpotifyIcon'
import { Toggle, NumberInput } from '../../components/ui/Inputs'

type SpotifySettings = Pick<
  AppSettings,
  | 'spotifyClientId'
  | 'spotifySongRequestsEnabled'
  | 'spotifyPlayEnabled'
  | 'spotifySkipEnabled'
  | 'spotifyAllowExplicit'
  | 'spotifyMaxQueueLength'
  | 'spotifyMaxPerUser'
>

const DEFAULT_SPOTIFY_SETTINGS: SpotifySettings = {
  spotifyClientId: DEFAULT_APP_SETTINGS.spotifyClientId,
  spotifySongRequestsEnabled: DEFAULT_APP_SETTINGS.spotifySongRequestsEnabled,
  spotifyPlayEnabled: DEFAULT_APP_SETTINGS.spotifyPlayEnabled,
  spotifySkipEnabled: DEFAULT_APP_SETTINGS.spotifySkipEnabled,
  spotifyAllowExplicit: DEFAULT_APP_SETTINGS.spotifyAllowExplicit,
  spotifyMaxQueueLength: DEFAULT_APP_SETTINGS.spotifyMaxQueueLength,
  spotifyMaxPerUser: DEFAULT_APP_SETTINGS.spotifyMaxPerUser
}

export default function SpotifyPage() {
  const [status, setStatus] = useState<SpotifyStatus>({ connected: false })
  const [queue, setQueue] = useState<SpotifySongRequest[]>([])
  const [settings, setSettings] = useState<SpotifySettings>(DEFAULT_SPOTIFY_SETTINGS)
  const [clientIdInput, setClientIdInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!window.api?.spotify) return
      try {
        const [s, q, allSettings] = await Promise.all([
          window.api.spotify.getStatus() as Promise<SpotifyStatus>,
          window.api.spotify.getQueue() as Promise<SpotifySongRequest[]>,
          window.api.settings.getAll() as Promise<AppSettings>
        ])
        if (!active) return
        setStatus(s)
        setQueue(q)
        applySettings(allSettings)
        setClientIdInput(allSettings.spotifyClientId)
      } catch (e) {
        console.error('Failed to load spotify data', e)
      }
    }
    void load()

    if (!window.api?.on) return
    const unsubStatus = window.api.on('spotify:status-changed', (s: any) => {
      if (active) setStatus(s)
    })
    const unsubQueue = window.api.on('spotify:queue-update', (q: any) => {
      if (active) setQueue(q)
    })
    const unsubSettings = window.api.on('settings:changed', (s: any) => {
      if (active) applySettings(s)
    })

    return () => {
      active = false
      unsubStatus()
      unsubQueue()
      unsubSettings()
    }
  }, [])

  function applySettings(s: AppSettings) {
    setSettings({
      spotifyClientId: s.spotifyClientId,
      spotifySongRequestsEnabled: s.spotifySongRequestsEnabled,
      spotifyPlayEnabled: s.spotifyPlayEnabled,
      spotifySkipEnabled: s.spotifySkipEnabled,
      spotifyAllowExplicit: s.spotifyAllowExplicit,
      spotifyMaxQueueLength: s.spotifyMaxQueueLength,
      spotifyMaxPerUser: s.spotifyMaxPerUser
    })
  }

  const updateSetting = async <K extends keyof SpotifySettings>(key: K, value: SpotifySettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    await window.api.settings.set(key, value)
  }

  const handleConnect = async () => {
    setConnectError('')
    setConnecting(true)
    try {
      const s = (await window.api.spotify.connect(clientIdInput.trim())) as SpotifyStatus
      setStatus(s)
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connection failed.')
    } finally {
      setConnecting(false)
    }
  }

  const activeQueue = queue.filter((r) => r.status === 'queued')
  const recentQueue = queue.filter((r) => r.status === 'skipped').slice(-5)

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <SpotifyIcon size={48} branded />
          </div>
          <div>
            <h1>Spotify Management</h1>
            <p className="app-page-intro">
              Synchronize your broadcast with Spotify. Viewers can request tracks directly via chat commands 
              to build a dynamic, collaborative stream soundtrack.
            </p>
          </div>
        </div>

        {status?.connected && (
          <div className="flex items-center gap-4 px-4 py-2 rounded-2xl bg-white/[0.03] border border-white/10 glass">
            <div className="p-2 rounded-lg bg-white/5 text-white/60">
              <IconUser size={16} />
            </div>
            <div className="text-left">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-40">Connected as</div>
              <div className="text-xs font-bold text-white">{status.displayName}</div>
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-10 items-start">
        <div className="flex flex-col gap-10">
          <section className="app-section-card glass">
            <div className="app-section-head flex-col items-center text-center gap-5 py-4">
              <SpotifyIcon size={44} branded />
              <div>
                <h2 className="text-sm font-black tracking-tight">Account Bridge</h2>
                <p className="text-[10px] opacity-40">{status?.connected ? 'Authentication active' : 'Awaiting authorization'}</p>
              </div>
            </div>
            
            <div className="p-4 pt-0">
              {!status?.connected ? (
                <div className="flex flex-col gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/20">Client ID (Optional)</label>
                    <input
                      type="text"
                      className="app-input w-full"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.currentTarget.value)}
                      placeholder="Use default client"
                    />
                  </div>
                  <button onClick={handleConnect} disabled={connecting} className="app-button-primary w-full !h-10 text-[10px] font-black uppercase tracking-widest">
                    {connecting ? 'Requesting Auth...' : 'Connect Spotify Account'}
                  </button>
                  {connectError && <p className="text-[10px] text-danger font-bold uppercase tracking-widest text-center">{connectError}</p>}
                </div>
              ) : (
                <button onClick={() => window.api.spotify.disconnect()} className="app-button-danger w-full !h-10 text-[10px] font-black uppercase tracking-widest">
                  Terminate Session
                </button>
              )}
            </div>
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Request Filters</h2>
                <p>Configure command permissions.</p>
              </div>
            </div>
            <div className="app-setting-list p-6 pt-0">
              <SpotifySetting label="Enable Requests" desc="Allow viewers to influence the playlist.">
                <Toggle value={settings.spotifySongRequestsEnabled} onChange={(v) => updateSetting('spotifySongRequestsEnabled', v)} />
              </SpotifySetting>

              <SpotifySetting label="PlayerPlay Command" desc="Enable !play <song> syntax." disabled={!settings.spotifySongRequestsEnabled}>
                <Toggle value={settings.spotifyPlayEnabled} onChange={(v) => updateSetting('spotifyPlayEnabled', v)} disabled={!settings.spotifySongRequestsEnabled} />
              </SpotifySetting>

              <SpotifySetting label="Skip Command" desc="Allow chat to vote-skip tracks." disabled={!settings.spotifySongRequestsEnabled}>
                <Toggle value={settings.spotifySkipEnabled} onChange={(v) => updateSetting('spotifySkipEnabled', v)} disabled={!settings.spotifySongRequestsEnabled} />
              </SpotifySetting>

              <SpotifySetting label="Explicit Audio" desc="Allow tracks with explicit metadata." disabled={!settings.spotifySongRequestsEnabled}>
                <Toggle value={settings.spotifyAllowExplicit} onChange={(v) => updateSetting('spotifyAllowExplicit', v)} disabled={!settings.spotifySongRequestsEnabled} />
              </SpotifySetting>

              <div className="h-px bg-white/[0.03] my-2" />

              <div className="flex items-center justify-between py-3">
                <div>
                  <h4 className="text-[11px] font-bold text-white/80 uppercase tracking-widest">Queue Hard Limit</h4>
                  <p className="text-[10px] text-white/20">Max tracks in backlog. 0 = unlimited.</p>
                </div>
                <NumberInput
                  value={settings.spotifyMaxQueueLength}
                  onChange={(value) => updateSetting('spotifyMaxQueueLength', value)}
                  min={0}
                  max={500}
                  className="!w-24 !h-9 !px-3 !text-xs text-right"
                />
              </div>

              <div className="flex items-center justify-between py-3">
                <div>
                  <h4 className="text-[11px] font-bold text-white/80 uppercase tracking-widest">Per-IconUser Cap</h4>
                  <p className="text-[10px] text-white/20">Max requests one viewer can hold.</p>
                </div>
                <NumberInput
                  value={settings.spotifyMaxPerUser}
                  onChange={(value) => updateSetting('spotifyMaxPerUser', value)}
                  min={1}
                  max={50}
                  className="!w-24 !h-9 !px-3 !text-xs text-right"
                />
              </div>
            </div>
          </section>
        </div>

        <section className="app-section-card glass min-h-[600px] flex flex-col">
          <div className="app-section-head">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/[0.03] text-white/40">
                <IconList size={18} />
              </div>
              <div>
                <h2>Backlog Queue</h2>
                <p>{activeQueue.length} Tracks in Sequence</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => window.api.spotify.skip()} className="app-button !h-10 !px-4 text-[10px] font-black uppercase tracking-widest">
                <IconPlayerSkipForward size={14} className="mr-2" />
                Skip
              </button>
              <button onClick={() => window.api.spotify.clearQueue()} className="app-button-danger !h-10 !px-4 text-[10px] font-black uppercase tracking-widest">
                Flush
              </button>
            </div>
          </div>

          <div className="flex-1 p-6 pt-0 overflow-y-auto custom-scrollbar">
            {activeQueue.length > 0 ? (
              <div className="flex flex-col gap-6">
                {activeQueue.map((req, i) => (
                  <QueueItem key={req.id} req={req} index={i + 1} onRemove={() => window.api.spotify.removeFromQueue(req.id)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-40 opacity-10">
                <IconMusic size={64} className="mb-4" />
                <p className="text-sm font-bold uppercase tracking-widest">Backlog Clear</p>
              </div>
            )}

            {recentQueue.length > 0 && (
              <div className="mt-10">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/10 mb-4 px-2">History Cache</div>
                <div className="flex flex-col gap-2 opacity-40">
                  {recentQueue.map((req) => (
                    <QueueItem key={req.id} req={req} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function SpotifySetting({ label, desc, children, disabled }: { label: string; desc: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-3 transition-opacity ${disabled ? 'opacity-20' : ''}`}>
      <div className="max-w-[200px]">
        <h4 className="text-[11px] font-bold text-white/80 uppercase tracking-widest">{label}</h4>
        <p className="text-[10px] text-white/20 font-medium leading-tight">{desc}</p>
      </div>
      {children}
    </div>
  )
}

function QueueItem({ req, index, onRemove }: { req: SpotifySongRequest; index?: number; onRemove?: () => void }) {
  const duration = `${Math.floor(req.track.durationMs / 60000)}:${Math.floor((req.track.durationMs % 60000) / 1000).toString().padStart(2, '0')}`

  return (
    <div className="flex items-center justify-between p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 hover:bg-white/[0.03] transition-all group">
      <div className="flex items-center gap-4 min-w-0">
        {index && <div className="text-[10px] font-black text-white/10 w-4">{index}</div>}
        <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/5 flex items-center justify-center text-white/20 group-hover:text-white transition-colors shrink-0">
          {req.track.albumArtUrl ? (
            <img src={req.track.albumArtUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <IconMusic size={14} className="group-hover:hidden" />
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <IconPlayerPlay size={14} fill="currentColor" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-white truncate" title={req.track.name}>{req.track.name}</p>
            {req.track.explicit && <span className="px-1 py-0.5 rounded-sm bg-white/10 text-[8px] font-black text-white/40 uppercase">E</span>}
          </div>
          <p className="text-[10px] text-white/30 font-medium truncate">{req.track.artists.join(', ')}</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex flex-col items-end">
          <div className="flex items-center gap-1.5">
            <PlatformLogo platform={req.platform as any} size={10} />
            <span className="text-[10px] font-bold text-white/40">{req.requestedBy}</span>
          </div>
          <div className="text-[9px] font-mono text-white/10 mt-0.5">{duration}</div>
        </div>
        {onRemove && (
          <button onClick={onRemove} className="p-2 rounded-lg hover:bg-danger/10 hover:text-danger text-white/10 transition-all">
            <IconTrash size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
