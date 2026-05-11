import { lazy, LazyExoticComponent } from 'react'
import type { Icon } from '@tabler/icons-react'
import {
  IconLayoutDashboard,
  IconStack2,
  IconMessages,
  IconMessage2,
  IconBell,
  IconMusic,
  IconSettings,
  IconVolume,
  IconMicrophone,
  IconBolt,
  IconRadio,
  IconActivity,
  IconTerminal2
} from '@tabler/icons-react'

import AICoHostIconFile from './assets/ai-co-host.svg'
import { SpotifyIcon } from './components/ui/SpotifyIcon'
import { HueIcon } from './components/ui/HueIcon'
import { GoveeIcon } from './components/ui/GoveeIcon'
import { ElgatoIcon } from './components/ui/ElgatoIcon'
import { DeskThingIcon } from './components/ui/DeskThingIcon'
import { NanoleafIcon } from './components/ui/NanoleafIcon'
import { LifxIcon } from './components/ui/LifxIcon'
import { LoupedeckIcon } from './components/ui/LoupedeckIcon'
import { RazerIcon } from './components/ui/RazerIcon'
import { LogitechIcon } from './components/ui/LogitechIcon'
import { YeelightIcon } from './components/ui/YeelightIcon'
import { WizIcon } from './components/ui/WizIcon'
import { FacebookIcon } from './components/ui/FacebookIcon'
import { InstagramIcon } from './components/ui/InstagramIcon'
import { RestreamIcon } from './components/ui/RestreamIcon'
import { LinkedinIcon } from './components/ui/LinkedinIcon'
import { TelegramIcon } from './components/ui/TelegramIcon'
import { PlatformLogo } from './components/platforms/PlatformLogo'

// --- Icon Wrappers ---
const TikTokIcon = ({ size, className }: { size?: number; className?: string }) => (
  <div className={className}><PlatformLogo platform="tiktok" size={size} /></div>
)
const TwitchIcon = ({ size, className }: { size?: number; className?: string }) => (
  <div className={className}><PlatformLogo platform="twitch" size={size} /></div>
)
const YouTubeIcon = ({ size, className }: { size?: number; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    className={`youtube-icon ${className}`}
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <path 
      className="yt-bg" 
      fill="#FF0000" 
      fillRule="evenodd" 
      d="M23.498 6.186a3.02 3.02 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.02 3.02 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.02 3.02 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.02 3.02 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814 M9.545 15.568V8.432L15.818 12z" 
    />
    <path className="yt-play" fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12z"/>
  </svg>
)
const KickIcon = ({ size, className }: { size?: number; className?: string }) => (
  <div className={className}><PlatformLogo platform="kick" size={size} /></div>
)
const XIcon = ({ size, className }: { size?: number; className?: string }) => (
  <div className={className}><PlatformLogo platform="x" size={size} /></div>
)
const DiscordIcon = ({ size, className }: { size?: number; className?: string }) => (
  <div className={className}><PlatformLogo platform="discord" size={size} /></div>
)
const AICoHostNavIcon = ({ size, className }: { size?: number; className?: string }) => (
  <img src={AICoHostIconFile} width={size} height={size} className={`object-contain ${className}`} alt="" />
)

// --- Route Definition ---
export interface AppRoute {
  path: string
  label: string
  description: string
  section: 'operate' | 'configure'
  icon: React.ComponentType<{ size?: number; className?: string }>
  component: LazyExoticComponent<React.ComponentType<any>>
}

export const routes: AppRoute[] = [
  {
    path: '/',
    label: 'Dashboard',
    description: 'Monitor platform health, audience activity, and automation readiness from one place.',
    section: 'operate',
    icon: IconLayoutDashboard,
    component: lazy(() => import('./pages/DashboardPage'))
  },
  {
    path: '/stats',
    label: 'Stats',
    description: 'Lifetime totals across every platform — likes, gifts, follows, song requests, and per-user breakdowns.',
    section: 'operate',
    icon: IconActivity,
    component: lazy(() => import('./pages/StatsPage'))
  },
  {
    path: '/broadcast',
    label: 'Broadcast',
    description: 'Go live directly from ilyStream. Composite your camera and overlays into a professional broadcast.',
    section: 'operate',
    icon: IconRadio,
    component: lazy(() => import('./pages/BroadcastPage'))
  },
  {
    path: '/chat',
    label: 'Unified Chat',
    description: 'Merge live chat, relay responses across services, and keep moderators aligned.',
    section: 'operate',
    icon: IconMessages,
    component: lazy(() => import('./pages/ChatPage'))
  },
  {
    path: '/tts',
    label: 'TTS',
    description: 'Tune text-to-speech behavior, queue flow, and voice delivery while you are live.',
    section: 'operate',
    icon: IconMessage2,
    component: lazy(() => import('./pages/TTSPage'))
  },
  {
    path: '/triggers',
    label: 'Triggers',
    description: 'Control reactions, alerts, webhooks, and spoken moments with event-driven rules.',
    section: 'operate',
    icon: IconBolt,
    component: lazy(() => import('./pages/TriggersPage'))
  },
  {
    path: '/ai-cohost',
    label: 'AI Co-Host',
    description: 'Configure your automated AI assistant, its personality, connection, and neural depth.',
    section: 'operate',
    icon: AICoHostNavIcon,
    component: lazy(() => import('./pages/AICoHostPage'))
  },
  {
    path: '/alerts',
    label: 'Alerts',
    description: 'Upload MP3/WAV files and route gifts, follows, and trigger events to local alert sounds.',
    section: 'operate',
    icon: IconBell,
    component: lazy(() => import('./pages/AlertsPage/index'))
  },
  {
    path: '/soundboard',
    label: 'Soundboard',
    description: 'A Stream Deck styled layout for triggering sound effects and studio actions instantly.',
    section: 'operate',
    icon: IconMusic,
    component: lazy(() => import('./pages/SoundboardPage'))
  },
  {
    path: '/voice-effects',
    label: 'Voice FX',
    description: 'Transform your voice with studio-grade real-time filters. Alien, Robot, and custom pitch shifting.',
    section: 'operate',
    icon: IconMicrophone,
    component: lazy(() => import('./pages/VoiceEffectsPage'))
  },
  {
    path: '/spotify',
    label: 'Spotify',
    description: 'Let viewers request songs via chat commands that queue directly into your Spotify playback.',
    section: 'operate',
    icon: SpotifyIcon,
    component: lazy(() => import('./pages/SpotifyPage/index'))
  },
  {
    path: '/connections/tiktok',
    label: 'TikTok',
    description: 'Manage TikTok Live credentials, session IDs, and real-time diagnostic feeds.',
    section: 'configure',
    icon: TikTokIcon,
    component: lazy(() => import('./pages/TikTokPage'))
  },
  {
    path: '/connections/twitch',
    label: 'Twitch',
    description: 'Configure Twitch IRC and Helix API settings for chat and alert processing.',
    section: 'configure',
    icon: TwitchIcon,
    component: lazy(() => import('./pages/TwitchPage'))
  },
  {
    path: '/connections/youtube',
    label: 'YouTube',
    description: 'Connect your YouTube Data API keys and monitor live chat polling cycles.',
    section: 'configure',
    icon: YouTubeIcon,
    component: lazy(() => import('./pages/YouTubePage'))
  },
  {
    path: '/connections/kick',
    label: 'Kick',
    description: 'Link your Kick.com channel via WebSocket for real-time stream event capture.',
    section: 'configure',
    icon: KickIcon,
    component: lazy(() => import('./pages/KickPage'))
  },
  {
    path: '/connections/x',
    label: 'X (Twitter)',
    description: 'Connect to the X Developer API to monitor real-time sentiment and mentions.',
    section: 'configure',
    icon: XIcon,
    component: lazy(() => import('./pages/XPage'))
  },
  {
    path: '/connections/discord',
    label: 'Discord',
    description: 'Sync your stream with Discord via webhooks and bot integration.',
    section: 'configure',
    icon: DiscordIcon,
    component: lazy(() => import('./pages/DiscordPage'))
  },
  {
    path: '/connections/hue',
    label: 'Philips Hue',
    description: 'Control smart lights and trigger visual alerts based on stream events.',
    section: 'configure',
    icon: HueIcon,
    component: lazy(() => import('./pages/HuePage'))
  },
  {
    path: '/connections/elgato',
    label: 'Elgato',
    description: 'Control your Stream Deck, Key Lights, and Prompter setup.',
    section: 'configure',
    icon: ElgatoIcon,
    component: lazy(() => import('./pages/ElgatoPage'))
  },
  {
    path: '/connections/govee',
    label: 'Govee',
    description: 'Sync your Govee Glide, Lyra, and Immersion lights with stream alerts.',
    section: 'configure',
    icon: GoveeIcon,
    component: lazy(() => import('./pages/GoveePage'))
  },
  {
    path: '/connections/deskthing',
    label: 'DeskThing',
    description: 'Pair a Spotify Car Thing as a tactile soundboard and stream-deck remote.',
    section: 'configure',
    icon: DeskThingIcon,
    component: lazy(() => import('./pages/DeskThingPage'))
  },
  {
    path: '/connections/nanoleaf',
    label: 'Nanoleaf',
    description: 'Synchronize your Nanoleaf Shapes, Lines, and Canvas with your stream.',
    section: 'configure',
    icon: NanoleafIcon,
    component: lazy(() => import('./pages/NanoleafPage'))
  },
  {
    path: '/connections/lifx',
    label: 'LIFX',
    description: 'Connect and control your high-performance LIFX bulbs and strips.',
    section: 'configure',
    icon: LifxIcon,
    component: lazy(() => import('./pages/LifxPage'))
  },
  {
    path: '/connections/loupedeck',
    label: 'Loupedeck',
    description: 'Map stream actions and volume dials to your Loupedeck Live or CT.',
    section: 'configure',
    icon: LoupedeckIcon,
    component: lazy(() => import('./pages/LoupedeckPage'))
  },
  {
    path: '/connections/razer',
    label: 'Razer Chroma',
    description: 'Synchronize your Razer peripherals with stream events via Chroma SDK.',
    section: 'configure',
    icon: RazerIcon,
    component: lazy(() => import('./pages/RazerPage'))
  },
  {
    path: '/connections/logitech',
    label: 'Logitech G',
    description: 'Sync your Logitech G peripherals with stream highlights and interactions.',
    section: 'configure',
    icon: LogitechIcon,
    component: lazy(() => import('./pages/LogitechPage'))
  },
  {
    path: '/connections/yeelight',
    label: 'Yeelight',
    description: 'Connect and control your Yeelight bulbs via LAN protocol.',
    section: 'configure',
    icon: YeelightIcon,
    component: lazy(() => import('./pages/YeelightPage'))
  },
  {
    path: '/connections/wiz',
    label: 'WiZ',
    description: 'Connect and control your WiZ smart lights via UDP protocol.',
    section: 'configure',
    icon: WizIcon,
    component: lazy(() => import('./pages/WizPage'))
  },
  {
    path: '/connections/facebook',
    label: 'Facebook',
    description: 'Connect your Facebook Page or Gaming Creator profile.',
    section: 'configure',
    icon: FacebookIcon,
    component: lazy(() => import('./pages/FacebookPage'))
  },
  {
    path: '/connections/instagram',
    label: 'Instagram',
    description: 'Broadcast vertically and interact with your Instagram followers.',
    section: 'configure',
    icon: InstagramIcon,
    component: lazy(() => import('./pages/InstagramPage'))
  },
  {
    path: '/connections/restream',
    label: 'ReStream',
    description: 'Broadcast to multiple platforms simultaneously via ReStream hub.',
    section: 'configure',
    icon: RestreamIcon,
    component: lazy(() => import('./pages/RestreamPage'))
  },
  {
    path: '/connections/linkedin',
    label: 'LinkedIn',
    description: 'Stream your professional workshops and coding sessions to LinkedIn.',
    section: 'configure',
    icon: LinkedinIcon,
    component: lazy(() => import('./pages/LinkedinPage'))
  },
  {
    path: '/connections/telegram',
    label: 'Telegram',
    description: 'Stream to your Telegram Channels and Groups securely.',
    section: 'configure',
    icon: TelegramIcon,
    component: lazy(() => import('./pages/TelegramPage'))
  },
  {
    path: '/console',
    label: 'Console',
    description: 'Real-time application log viewer with level filtering, search, and export.',
    section: 'configure',
    icon: IconTerminal2,
    component: lazy(() => import('./pages/ConsolePage'))
  },
  {
    path: '/settings',
    label: 'Settings',
    description: 'Tune themes, runtime limits, broadcast defaults, OBS remote control, and overlay delivery.',
    section: 'configure',
    icon: IconSettings,
    component: lazy(() => import('./pages/SettingsPage'))
  },
  {
    path: '/widgets',
    label: 'Widgets',
    description: 'Configure interactive overlays, goals, and visual alerts for your stream.',
    section: 'configure',
    icon: IconStack2,
    component: lazy(() => import('./pages/WidgetPage'))
  }
]
