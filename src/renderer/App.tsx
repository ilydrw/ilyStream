import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, lazy } from 'react'
import { routes } from './routes'
import { DashboardLayout } from './components/layout/DashboardLayout'

// Static imports for core performance-critical pages
import BroadcastPage from './pages/BroadcastPage'
import StudioOverlayPage from './pages/BroadcastPage/StudioOverlay'
import { usePlatformEvents } from './hooks/usePlatformEvents'
import { useTTS } from './hooks/useTTS'
import { useSettingsSync } from './hooks/useSettingsSync'
import { useSoundPlayback } from './hooks/useSoundPlayback'
import { useLogInterception } from './hooks/useLogInterception'
import { useUpdateSync } from './hooks/useUpdateSync'
import { useUIStore } from './stores/ui-store'
import { ToastContainer } from './components/ui/Toast'

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

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#ff5f56', fontFamily: 'monospace', fontSize: 14 }}>
          <h2 style={{ color: '#fff', marginBottom: 12 }}>Something crashed</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ff9999' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#666', marginTop: 8, fontSize: 11 }}>{this.state.error.stack}</pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16, padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Try Again
          </button>
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
            <BroadcastPage />
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
              <Suspense fallback={
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
                </div>
              }>
                <Routes location={location}>
                  {routes.map((route: any) => (
                    <Route 
                      key={route.path} 
                      path={route.path} 
                      element={route.path === '/broadcast' ? null : <route.component />} 
                    />
                  ))}
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
