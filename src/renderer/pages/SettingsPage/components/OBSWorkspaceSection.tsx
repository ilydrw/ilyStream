import { useCallback, useEffect, useState } from 'react'
import {
  IconBrowser,
  IconCopy,
  IconExternalLink,
  IconPackage,
  IconPalette,
  IconPlugConnected,
  IconRefresh,
  IconShieldLock
} from '@tabler/icons-react'
import type { OBSWorkspaceAccess, OBSWorkspaceSetupStatus } from '../../../../shared/obs-workspace'
import { RuntimeValue } from './SettingsShared'

export function OBSWorkspaceSection() {
  const [access, setAccess] = useState<OBSWorkspaceAccess | null>(null)
  const [setup, setSetup] = useState<OBSWorkspaceSetupStatus | null>(null)
  const [busy, setBusy] = useState<'copy' | 'open' | 'rotate' | 'theme' | 'stage' | 'apply' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!window.api?.obsWorkspace) return
    const [nextAccess, nextSetup] = await Promise.all([
      window.api.obsWorkspace.getAccess(),
      window.api.obsWorkspace.getSetupStatus()
    ])
    setAccess(nextAccess)
    setSetup(nextSetup)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const run = async (action: 'copy' | 'open' | 'rotate') => {
    if (!access || busy) return
    setBusy(action)
    setNotice(null)
    try {
      if (action === 'copy') {
        if (!access.pairUrl) throw new Error('The Control Center is offline.')
        await window.api.system.copyToClipboard(access.pairUrl)
        setNotice('Paired dock URL copied. Keep it private—it controls your local ilyStream session.')
      } else if (action === 'open') {
        await window.api.obsWorkspace.openControlCenter()
        setNotice('Control Center opened in your default browser.')
      } else {
        const confirmed = window.confirm(
          'Rotate the OBS dock pairing? Existing ilyStream Control Center docks will need the new URL.'
        )
        if (!confirmed) return
        const next = await window.api.obsWorkspace.rotatePairing()
        setAccess(next)
        if (next.pairUrl) await window.api.system.copyToClipboard(next.pairUrl)
        setNotice('Pairing rotated and the replacement dock URL was copied.')
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const runSetup = async (action: 'theme' | 'stage' | 'apply') => {
    if (busy) return
    setBusy(action)
    setNotice(null)
    try {
      const result = action === 'theme'
        ? await window.api.obsWorkspace.installTheme()
        : action === 'stage'
          ? await window.api.obsWorkspace.stagePlugin()
          : await window.api.obsWorkspace.installStagedPlugin()
      setSetup(result.status)
      setNotice(result.message)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const bridge = access?.nativeBridge

  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconBrowser size={32} />
          </div>
          <div>
            <h2>ilyStream OBS Workspace</h2>
            <p>Control Center dock, widget tools, theme, and optional native bridge.</p>
          </div>
        </div>
        <span className={`app-status-chip ${access?.running ? 'is-good' : 'is-danger'}`}>
          {access?.running ? `Port ${access.port}` : 'Offline'}
        </span>
      </div>

      <div className="app-section-content !p-0">
        <div className="flex flex-col gap-6 p-8">
          <div className="rounded-lg border border-white/5 bg-black/40 p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <IconPlugConnected size={18} className={bridge?.connected ? 'text-success' : 'text-white/25'} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white/75">Native OBS bridge</p>
                  <p className="truncate text-[10px] text-white/30">
                    {bridge?.connected
                      ? `Plugin ${bridge.clientVersion || 'connected'} · OBS ${bridge.obsVersion || 'unknown'}`
                      : bridge?.running
                        ? 'Ready for the optional ilyStream OBS plugin'
                        : bridge?.lastError || 'Bridge service offline'}
                  </p>
                </div>
              </div>
              <span className={`app-status-chip ${bridge?.connected ? 'is-good' : bridge?.running ? 'is-warning' : 'is-danger'}`}>
                {bridge?.connected ? 'Linked' : bridge?.running ? 'Ready' : 'Offline'}
              </span>
            </div>
            <div className="space-y-3">
              <RuntimeValue label="Control URL" value={access?.controlUrl || 'Starting…'} />
              <RuntimeValue label="Protocol" value={`v${access?.protocol || 1}`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="app-button-primary !h-11 !text-xs"
              disabled={!access?.pairUrl || busy !== null}
              onClick={() => void run('copy')}
            >
              <IconCopy size={16} className="mr-2" />
              {busy === 'copy' ? 'Copying…' : 'Copy paired dock URL'}
            </button>
            <button
              type="button"
              className="app-button !h-11 !text-xs"
              disabled={!access?.pairUrl || busy !== null}
              onClick={() => void run('open')}
            >
              <IconExternalLink size={16} className="mr-2" />
              {busy === 'open' ? 'Opening…' : 'Open Control Center'}
            </button>
          </div>

          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-6">
            <div className="mb-4 flex items-center gap-3 text-white/70">
              <IconShieldLock size={17} className="text-accent" />
              <p className="text-xs font-semibold">Add it to OBS without replacing anything</p>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-[11px] leading-relaxed text-white/40">
              <li>Copy the paired dock URL above.</li>
              <li>In OBS, open <span className="text-white/65">Docks → Custom Browser Docks</span>.</li>
              <li>Name it <span className="text-white/65">ilyStream Control Center</span>, paste the URL, and Apply.</li>
            </ol>
            <p className="mt-4 text-[10px] leading-relaxed text-white/25">
              It uses stock OBS dock and browser-source APIs, so StreamElements and your existing plugins keep their own docks, sources, and settings.
            </p>
          </div>

          <div className="rounded-lg border border-white/5 bg-black/30 p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <IconPalette size={18} className="shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white/75">Cyber Neon OBS theme</p>
                  <p className="truncate text-[10px] text-white/30">
                    {setup?.theme.detail || 'Checking the optional OBS theme package…'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="app-button !h-9 !px-3 !text-[10px]"
                disabled={!setup?.theme.available || busy !== null}
                onClick={() => void runSetup('theme')}
              >
                {busy === 'theme' ? 'Installing…' : setup?.theme.installed ? 'Update' : 'Install'}
              </button>
            </div>

            <div className="border-t border-white/5 pt-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <IconPackage size={18} className="shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/75">Native OBS workspace plugin</p>
                    <p className="truncate text-[10px] text-white/30">
                      {setup?.plugin.detail || 'Checking the verified build package…'}
                    </p>
                  </div>
                </div>
                <span className={`app-status-chip ${setup?.plugin.installed ? 'is-good' : setup?.plugin.stagedPath ? 'is-warning' : ''}`}>
                  {setup?.plugin.installed ? 'Installed' : setup?.plugin.stagedPath ? 'Staged' : 'Optional'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="app-button !h-10 !text-[10px]"
                  disabled={!setup?.plugin.available || busy !== null}
                  onClick={() => void runSetup('stage')}
                >
                  {busy === 'stage' ? 'Verifying…' : setup?.plugin.stagedPath ? 'Restage verified build' : 'Stage verified build'}
                </button>
                <button
                  type="button"
                  className="app-button !h-10 !text-[10px]"
                  disabled={!setup?.plugin.stagedPath || setup?.obsRunning || busy !== null}
                  title={setup?.obsRunning ? 'Close OBS after ending the stream first.' : 'Install the staged native plugin.'}
                  onClick={() => void runSetup('apply')}
                >
                  {busy === 'apply' ? 'Installing…' : setup?.obsRunning ? 'Close OBS to install' : 'Install staged plugin'}
                </button>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-white/25">
                Staging is safe while live. Native DLL installation is blocked while the target OBS process is running; ilyStream never closes or restarts OBS for you.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5">
            <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-white/30">
              {notice || access?.lastError || 'The paired URL contains a local control credential. Rotate it if it is ever shared accidentally.'}
            </p>
            <div className="flex gap-2">
              <button type="button" className="app-button !h-9 !px-3 !text-[10px]" onClick={() => void refresh()}>
                <IconRefresh size={14} />
              </button>
              <button
                type="button"
                className="app-button !h-9 !px-3 !text-[10px]"
                disabled={!access?.running || busy !== null}
                onClick={() => void run('rotate')}
              >
                {busy === 'rotate' ? 'Rotating…' : 'Rotate pairing'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
