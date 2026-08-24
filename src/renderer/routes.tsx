import { lazy, LazyExoticComponent } from 'react'
import {
  IconBroadcast,
  IconVideo,
  IconChat,
  IconTTS,
  IconAutomation,
  IconTerminal,
  IconAlert,
  IconSoundboard,
  IconFx,
  IconSettings,
  IconStats,
  IconEconomy,
  IconWidgets,
  IconHealthCenter
} from './components/ui/icons/nav'

import { DashboardIcon } from './components/ui/icons/DashboardIcon'
import { AICoHostIcon } from './components/ui/icons/AICoHostIcon'
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
const navMonochromeClass = (className?: string) =>
  ['app-nav-monochrome-icon', className].filter(Boolean).join(' ')
const AICoHostNavIcon = ({ size, className }: { size?: number; className?: string }) => (
  <AICoHostIcon size={size} className={navMonochromeClass(className)} />
)
const DashboardNavIcon = ({ size, className }: { size?: number; className?: string }) => (
  <DashboardIcon size={size} className={navMonochromeClass(className)} />
)
const BroadcastRoutePlaceholder = lazy(() => Promise.resolve({ default: () => null }))

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
    icon: DashboardNavIcon,
    component: lazy(() => import('./pages/DashboardPage'))
  },
  {
    path: '/health',
    label: 'Health Center',
    description: 'Check connection readiness, chat relay capability, event traffic, and platform-specific fixes.',
    section: 'operate',
    icon: IconHealthCenter,
    component: lazy(() => import('./pages/HealthPage'))
  },
  {
    path: '/stats',
    label: 'Audience Stats',
    description: 'Review live, session, and lifetime audience totals with per-user and per-platform breakdowns.',
    section: 'operate',
    icon: IconStats,
    component: lazy(() => import('./pages/StatsPage'))
  },
  {
    path: '/economy',
    label: 'Points & Rewards',
    description: 'Manage viewer points, level bonuses, games, redemptions, sounds, and lighting rewards.',
    section: 'operate',
    icon: IconEconomy,
    component: lazy(() => import('./pages/EconomyPage'))
  },
  {
    path: '/broadcast',
    label: 'Broadcast Studio',
    description: 'Build scenes, manage sources, mix audio, and start the live or recording output.',
    section: 'operate',
    icon: IconBroadcast,
    component: BroadcastRoutePlaceholder
  },
  {
    path: '/recordings',
    label: 'Recordings',
    description: 'Manage your past broadcasts and high-quality captures.',
    section: 'operate',
    icon: IconVideo,
    component: lazy(() => import('./pages/RecordingsPage'))
  },
  {
    path: '/chat',
    label: 'Chat Hub',
    description: 'Read every platform chat in one place and relay host responses across connected services.',
    section: 'operate',
    icon: IconChat,
    component: lazy(() => import('./pages/ChatPage'))
  },
  {
    path: '/tts',
    label: 'Text-to-Speech',
    description: 'Control who can speak, what gets filtered, and how chat messages enter the voice queue.',
    section: 'operate',
    icon: IconTTS,
    component: lazy(() => import('./pages/TTSPage'))
  },
  {
    path: '/triggers',
    label: 'Automation Rules',
    description: 'Turn stream events into alerts, voice lines, device actions, webhooks, and other reactions.',
    section: 'operate',
    icon: IconAutomation,
    component: lazy(() => import('./pages/TriggersPage'))
  },
  {
    path: '/event-lab',
    label: 'Event Lab',
    description: 'Test realistic events and inspect what they send to alerts, widgets, automations, and devices.',
    section: 'operate',
    icon: IconTerminal,
    component: lazy(() => import('./pages/EventLabPage'))
  },
  {
    path: '/ai-cohost',
    label: 'AI Co-Host',
    description: 'Configure when the AI responds, what it sounds like, and which chat prompts can wake it.',
    section: 'operate',
    icon: AICoHostNavIcon,
    component: lazy(() => import('./pages/AICoHostPage'))
  },
  {
    path: '/alerts',
    label: 'Alert Routes',
    description: 'Choose which stream events show sounds, images, and messages in the overlay.',
    section: 'operate',
    icon: IconAlert,
    component: lazy(() => import('./pages/AlertsPage/index'))
  },
  {
    path: '/soundboard',
    label: 'Soundboard',
    description: 'Trigger sound effects and studio actions instantly from a grid built for live use.',
    section: 'operate',
    icon: IconSoundboard,
    component: lazy(() => import('./pages/SoundboardPage'))
  },
  {
    path: '/voice-effects',
    label: 'Voice FX',
    description: 'Apply real-time voice filters and pitch effects for stream moments.',
    section: 'operate',
    icon: IconFx,
    component: lazy(() => import('./pages/VoiceEffectsPage'))
  },
  {
    path: '/spotify',
    label: 'Song Requests',
    description: 'Connect Spotify and control viewer song-request commands, queue behavior, and playback status.',
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
    label: 'X Composer',
    description: 'Prepare reusable go-live posts, open X composer, or enable paid-API automatic posting.',
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
    icon: IconTerminal,
    component: lazy(() => import('./pages/ConsolePage'))
  },
  {
    path: '/engine-preview',
    label: 'Engine Preview',
    description: 'Live preview of frames composited by the native bgfx engine.',
    section: 'configure',
    icon: IconVideo,
    component: lazy(() => import('./pages/EnginePreviewPage'))
  },
  {
    path: '/settings',
    label: 'Settings',
    description: 'Tune app defaults, broadcast settings, overlay delivery, integrations, and advanced runtime options.',
    section: 'configure',
    icon: IconSettings,
    component: lazy(() => import('./pages/SettingsPage'))
  },
  {
    path: '/widgets',
    label: 'Overlays & Widgets',
    description: 'Configure browser-source overlays, goals, chat widgets, trackers, and visual stream elements.',
    section: 'configure',
    icon: IconWidgets,
    component: lazy(() => import('./pages/WidgetPage'))
  }
]
