import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, lazy } from 'react'
import { routes } from './routes'
import { DashboardLayout } from './components/layout/DashboardLayout'

// Static imports for core performance-critical pages
import BroadcastPage from './pages/BroadcastPage'
import StudioOverlayPage from './pages/BroadcastPage/StudioOverlay'
import ViewerProfilePage from './pages/StatsPage/ViewerProfilePage'
import { usePlatformEvents } from './hooks/usePlatformEvents'
import { useTTS } from './hooks/useTTS'
import { useSettingsSync } from './hooks/useSettingsSync'
import { useSoundPlayback } from './hooks/useSoundPlayback'
import { useLogInterception } from './hooks/useLogInterception'
import { useUpdateSync } from './hooks/useUpdateSync'
import { useUIStore } from './stores/ui-store'
import { ToastContainer } from './components/ui/Toast'
import { GoveeBleRuntime } from './components/govee/GoveeBleRuntime'
import { isRendererAssetLoadError } from './lib/renderer-asset-error'
import { LoadingState } from './components/ui/LoadingState'

function MountingDiagnostics() {
  useEffect(() => {
    console.log('[Lifecycle] App components mounted. UI is visible.')
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = window.api?.on?.('system:ping', () => {
        console.log('[Lifecycle] Received ping from main process.')
      })
    } catch (error) {
      console.warn('[Lifecycle] Failed to subscribe to system ping:', error)
    }
    return () => {
      unsubscribe?.()
      console.log('[Lifecycle] App components unmounting.')
    }
  }, [])
  return null
}

const SOUND_ROUTES = ['/tts', '/alerts', '/spotify']

import { IconAlertTriangle, IconRefresh, IconCopy } from '@tabler/icons-react'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; incidentId: string | null }> {
  state: { error: Error | null; incidentId: string | null } = { error: null, incidentId: null }

  static getDerivedStateFromError(error: Error) {
    return { error, incidentId: crypto.randomUUID().slice(0, 8).toUpperCase() }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const isAssetLoadError = isRendererAssetLoadError(this.state.error)
      const { name, message } = this.state.error
      const incidentId = this.state.incidentId || 'UNKNOWN'

      return (
        <div className="w-full h-full min-h-screen flex items-center justify-center bg-[#0E0E12] p-8">
          <div className="w-full max-w-md bg-white/[0.02] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-6 text-center">
            <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center">
              <IconAlertTriangle size={32} className="text-danger" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-medium text-white">
                {isAssetLoadError ? 'Reload required' : 'Something went wrong'}
              </h2>
              <p className="text-sm text-white/50 max-w-sm mx-auto">
                {isAssetLoadError
                  ? 'ilyStream was rebuilt while this window was open. Reload the app to use the latest files.'
                  : 'This page hit an unexpected error. Your settings were not changed.'}
              </p>
              {!isAssetLoadError && <p className="text-xs font-mono text-white/30">Incident {incidentId}</p>}
            </div>

            <div className="flex flex-col w-full gap-3 mt-2">
              <div className="flex gap-3">
                <button
                  onClick={() => this.setState({ error: null, incidentId: null })}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/80 hover:text-white transition-colors"
                >
                  <IconRefresh size={18} />
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-accent hover:bg-accent/90 text-white transition-colors shadow-lg shadow-accent/20"
                >
                  Reload App
                </button>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    JSON.stringify(
                      { incidentId, name, message, timestamp: new Date().toISOString() },
                      null,
                      2
                    )
                  )
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
              >
                <IconCopy size={16} />
                Copy Diagnostics
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

import { ConsoleModal } from './components/ui/ConsoleModal'

export default function App() {
  const [isMounted, setIsMounted] = useState(false)
  const [keepBroadcastMounted, setKeepBroadcastMounted] = useState(() => window.location.pathname === '/broadcast')

  useEffect(() => {
    console.log('[Lifecycle] App starting mount sequence...')
    setIsMounted(true)
  }, [])

  // Re-enabling hooks now that infrastructure is stable
  useSettingsSync()
  usePlatformEvents(isMounted)
  useTTS(isMounted)
  useSoundPlayback()
  useLogInterception()
  useUpdateSync()
  
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search || window.location.search)
  const projectorSceneId = searchParams.get('projectorSceneId')
  const projectorLayerId = searchParams.get('projectorLayerId')
  const isOverlay = Boolean(projectorSceneId) || location.pathname.startsWith('/overlay/')
  const isBroadcastRoute = location.pathname === '/broadcast'

  useEffect(() => {
    if (isBroadcastRoute) {
      setKeepBroadcastMounted(true)
    }
  }, [isBroadcastRoute])

  useEffect(() => {
    if (isOverlay) return
    let disposed = false
    const ensureProgramRuntime = (value: number | { count?: number }) => {
      const count = typeof value === 'number' ? value : Number(value?.count) || 0
      if (!disposed && count > 0) setKeepBroadcastMounted(true)
    }
    void window.api?.obsWorkspace?.getAccess?.()
      .then(access => ensureProgramRuntime(access.nativeBridge.programConsumers))
      .catch(() => {})
    const unsubscribe = window.api?.on?.('obs:program-consumers-changed', ensureProgramRuntime)
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [isOverlay])

  if (projectorSceneId) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-black">
        <ErrorBoundary>
          <StudioOverlayPage sceneId={projectorSceneId} layerId={projectorLayerId || undefined} />
        </ErrorBoundary>
      </div>
    )
  }

  const renderedRoutes = (
    <ErrorBoundary>
      <div className="flex-1 flex flex-col min-h-0">
        {!isOverlay && keepBroadcastMounted && (
          <div
            aria-hidden={!isBroadcastRoute}
            className={
              isBroadcastRoute
                ? 'flex-1 flex flex-col min-h-0'
                : 'fixed left-[-10000px] top-0 h-screen w-screen overflow-hidden opacity-0 pointer-events-none'
            }
          >
            <BroadcastPage isRouteActive={isBroadcastRoute} />
          </div>
        )}

        {!isBroadcastRoute && (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={location.pathname}
              initial={isOverlay ? undefined : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={isOverlay ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex-1 flex flex-col min-h-0"
            >
              <Suspense fallback={<LoadingState />}>
                <Routes location={location}>
                  {routes.map((route: any) => (
                    <Route 
                      key={route.path} 
                      path={route.path} 
                      element={route.path === '/broadcast' ? null : <route.component />} 
                    />
                  ))}
                  <Route path="/stats/viewer/:id" element={<ViewerProfilePage />} />
                  <Route path="/overlay/studio/:sceneId" element={<StudioOverlayPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </ErrorBoundary>
  )

  if (isOverlay) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-black">
        {renderedRoutes}
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <MountingDiagnostics />
      <GoveeBleRuntime />
      <ConsoleModal />
      <DashboardLayout>
        <ToastContainer />
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
          {renderedRoutes}
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  )
}
