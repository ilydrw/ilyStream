import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { DashboardLayout } from './components/layout/DashboardLayout'
import DashboardPage from './pages/DashboardPage'
import ChatPage from './pages/ChatPage'
import TTSPage from './pages/TTSPage'
import TriggersPage from './pages/TriggersPage'
import AlertsPage from './pages/AlertsPage/index'
import SpotifyPage from './pages/SpotifyPage/index'
import HuePage from './pages/HuePage'
import TikTokPage from './pages/TikTokPage'
import TwitchPage from './pages/TwitchPage'
import YouTubePage from './pages/YouTubePage'
import KickPage from './pages/KickPage'
import XPage from './pages/XPage'
import DiscordPage from './pages/DiscordPage'
import SettingsPage from './pages/SettingsPage'
import WidgetPage from './pages/WidgetPage'
import BroadcastPage from './pages/BroadcastPage'
import StudioOverlayPage from './pages/BroadcastPage/StudioOverlay'
import StatsPage from './pages/StatsPage'
import SoundboardPage from './pages/SoundboardPage'
import VoiceEffectsPage from './pages/VoiceEffectsPage'
import AICoHostPage from './pages/AICoHostPage'
import DeskThingPage from './pages/DeskThingPage'
import GoveePage from './pages/GoveePage'
import ElgatoPage from './pages/ElgatoPage'
import NanoleafPage from './pages/NanoleafPage'
import LifxPage from './pages/LifxPage'
import LoupedeckPage from './pages/LoupedeckPage'
import RazerPage from './pages/RazerPage'
import LogitechPage from './pages/LogitechPage'
import YeelightPage from './pages/YeelightPage'
import WizPage from './pages/WizPage'
import FacebookPage from './pages/FacebookPage'
import InstagramPage from './pages/InstagramPage'
import RestreamPage from './pages/RestreamPage'
import LinkedinPage from './pages/LinkedinPage'
import TelegramPage from './pages/TelegramPage'
import { usePlatformEvents } from './hooks/usePlatformEvents'
import { useTTS } from './hooks/useTTS'
import { useSettingsSync } from './hooks/useSettingsSync'
import { useSoundPlayback } from './hooks/useSoundPlayback'
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
  
  const location = useLocation()
  const projectorSceneId = new URLSearchParams(location.search || window.location.search).get('projectorSceneId')
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
          <StudioOverlayPage sceneId={projectorSceneId} />
        </ErrorBoundary>
      </div>
    )
  }

  const routes = (
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
              initial={isOverlay ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={isOverlay ? false : { opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex-1 flex flex-col min-h-0"
            >
              {console.log('[nav] Rendering Routes for path:', location.pathname)}
              <Routes location={location}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/broadcast" element={null} />
                <Route path="/overlay/studio/:sceneId" element={<StudioOverlayPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/tts" element={<TTSPage />} />
                <Route path="/triggers" element={<TriggersPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/soundboard" element={<SoundboardPage />} />
                <Route path="/voice-effects" element={<VoiceEffectsPage />} />
                <Route path="/ai-cohost" element={<AICoHostPage />} />
                <Route path="/spotify" element={<SpotifyPage />} />
                <Route path="/connections/tiktok" element={<TikTokPage />} />
                <Route path="/connections/twitch" element={<TwitchPage />} />
                <Route path="/connections/youtube" element={<YouTubePage />} />
                <Route path="/connections/kick" element={<KickPage />} />
                <Route path="/connections/x" element={<XPage />} />
                <Route path="/connections/discord" element={<DiscordPage />} />
                <Route path="/connections/hue" element={<HuePage />} />
                <Route path="/connections/govee" element={<GoveePage />} />
                <Route path="/connections/elgato" element={<ElgatoPage />} />
                <Route path="/connections/nanoleaf" element={<NanoleafPage />} />
                <Route path="/connections/lifx" element={<LifxPage />} />
                <Route path="/connections/loupedeck" element={<LoupedeckPage />} />
                <Route path="/connections/razer" element={<RazerPage />} />
                <Route path="/connections/logitech" element={<LogitechPage />} />
                <Route path="/connections/yeelight" element={<YeelightPage />} />
                <Route path="/connections/wiz" element={<WizPage />} />
                <Route path="/connections/facebook" element={<FacebookPage />} />
                <Route path="/connections/instagram" element={<InstagramPage />} />
                <Route path="/connections/restream" element={<RestreamPage />} />
                <Route path="/connections/linkedin" element={<LinkedinPage />} />
                <Route path="/connections/telegram" element={<TelegramPage />} />
                <Route path="/connections/deskthing" element={<DeskThingPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/widgets" element={<WidgetPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </ErrorBoundary>
  )

  if (isOverlay) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-black">
        {routes}
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <MountingDiagnostics />
      <DashboardLayout>
        <ToastContainer />
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
          {routes}
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  )
}
