import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Layers,
  MessagesSquare,
  MessageSquareQuote,
  Bell,
  Music2,
  PlugZap,
  Settings2,
  Volume2,
  Mic2,
  Zap,
  Radio,
  Activity,
  Bot,
  Twitter,
  MessageSquare
} from 'lucide-react'

export interface NavigationItem {
  path: string
  label: string
  eyebrow: string
  description: string
  section: 'operate' | 'configure'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

import { SpotifyIcon } from '../ui/SpotifyIcon'
import { HueIcon } from '../ui/HueIcon'
import { GoveeIcon } from '../ui/GoveeIcon'
import { ElgatoIcon } from '../ui/ElgatoIcon'
import { DeskThingIcon } from '../ui/DeskThingIcon'
import { NanoleafIcon } from '../ui/NanoleafIcon'
import { LifxIcon } from '../ui/LifxIcon'
import { LoupedeckIcon } from '../ui/LoupedeckIcon'
import { RazerIcon } from '../ui/RazerIcon'
import { LogitechIcon } from '../ui/LogitechIcon'
import { YeelightIcon } from '../ui/YeelightIcon'
import { WizIcon } from '../ui/WizIcon'
import { FacebookIcon } from '../ui/FacebookIcon'
import { InstagramIcon } from '../ui/InstagramIcon'
import { RestreamIcon } from '../ui/RestreamIcon'
import { LinkedinIcon } from '../ui/LinkedinIcon'
import { TelegramIcon } from '../ui/TelegramIcon'

import { PlatformLogo } from '../platforms/PlatformLogo'

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
const FacebookPageIcon = ({ size, className }: { size?: number; className?: string }) => (
  <FacebookIcon size={size} className={className} />
)
const InstagramPageIcon = ({ size, className }: { size?: number; className?: string }) => (
  <InstagramIcon size={size} className={className} />
)
const RestreamPageIcon = ({ size, className }: { size?: number; className?: string }) => (
  <RestreamIcon size={size} className={className} />
)
const LinkedinPageIcon = ({ size, className }: { size?: number; className?: string }) => (
  <LinkedinIcon size={size} className={className} />
)
const TelegramPageIcon = ({ size, className }: { size?: number; className?: string }) => (
  <TelegramIcon size={size} className={className} />
)

export const navigationItems: NavigationItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    eyebrow: 'Stream Center',
    description: 'Monitor platform health, audience activity, and automation readiness from one place.',
    section: 'operate',
    icon: LayoutDashboard
  },
  {
    path: '/stats',
    label: 'Stats',
    eyebrow: 'Lifetime Telemetry',
    description: 'Lifetime totals across every platform — likes, gifts, follows, song requests, and per-user breakdowns.',
    section: 'operate',
    icon: Activity
  },
  {
    path: '/broadcast',
    label: 'Broadcast',
    eyebrow: 'Direct Stream',
    description: 'Go live directly from ilyStream. Composite your camera and overlays into a professional broadcast.',
    section: 'operate',
    icon: Radio
  },
  {
    path: '/chat',
    label: 'Unified Chat',
    eyebrow: 'Conversation Bus',
    description: 'Merge live chat, relay responses across services, and keep moderators aligned.',
    section: 'operate',
    icon: MessagesSquare
  },
  {
    path: '/tts',
    label: 'TTS',
    eyebrow: 'Voice Engine',
    description: 'Tune text-to-speech behavior, queue flow, and voice delivery while you are live.',
    section: 'operate',
    icon: MessageSquareQuote
  },
  {
    path: '/triggers',
    label: 'Triggers',
    eyebrow: 'Automation Rules',
    description: 'Control reactions, alerts, webhooks, and spoken moments with event-driven rules.',
    section: 'operate',
    icon: Zap
  },
  {
    path: '/ai-cohost',
    label: 'AI Co-Host',
    eyebrow: 'Neural Agent',
    description: 'Configure your automated AI assistant, its personality, connection, and neural depth.',
    section: 'operate',
    icon: Bot
  },
  {
    path: '/alerts',
    label: 'Alerts',
    eyebrow: 'Alert Sounds',
    description: 'Upload MP3/WAV files and route gifts, follows, and trigger events to local alert sounds.',
    section: 'operate',
    icon: Bell
  },
  {
    path: '/soundboard',
    label: 'Soundboard',
    eyebrow: 'Studio Deck',
    description: 'A Stream Deck styled layout for triggering sound effects and studio actions instantly.',
    section: 'operate',
    icon: Music2
  },
  {
    path: '/voice-effects',
    label: 'Voice FX',
    eyebrow: 'Vocal Filters',
    description: 'Transform your voice with studio-grade real-time filters. Alien, Robot, and custom pitch shifting.',
    section: 'operate',
    icon: Mic2
  },
  {
    path: '/spotify',
    label: 'Spotify',
    eyebrow: 'Song Requests',
    description: 'Let viewers request songs via chat commands that queue directly into your Spotify playback.',
    section: 'operate',
    icon: SpotifyIcon
  },
  {
    path: '/connections/tiktok',
    label: 'TikTok',
    eyebrow: 'Platform Wiring',
    description: 'Manage TikTok Live credentials, session IDs, and real-time diagnostic feeds.',
    section: 'configure',
    icon: TikTokIcon
  },
  {
    path: '/connections/twitch',
    label: 'Twitch',
    eyebrow: 'Platform Wiring',
    description: 'Configure Twitch IRC and Helix API settings for chat and alert processing.',
    section: 'configure',
    icon: TwitchIcon
  },
  {
    path: '/connections/youtube',
    label: 'YouTube',
    eyebrow: 'Platform Wiring',
    description: 'Connect your YouTube Data API keys and monitor live chat polling cycles.',
    section: 'configure',
    icon: YouTubeIcon
  },
  {
    path: '/connections/kick',
    label: 'Kick',
    eyebrow: 'Platform Wiring',
    description: 'Link your Kick.com channel via WebSocket for real-time stream event capture.',
    section: 'configure',
    icon: KickIcon
  },
  {
    path: '/connections/x',
    label: 'X (Twitter)',
    eyebrow: 'Platform Wiring',
    description: 'Connect to the X Developer API to monitor real-time sentiment and mentions.',
    section: 'configure',
    icon: XIcon
  },
  {
    path: '/connections/discord',
    label: 'Discord',
    eyebrow: 'Community Bridge',
    description: 'Sync your stream with Discord via webhooks and bot integration.',
    section: 'configure',
    icon: DiscordIcon
  },
  {
    path: '/connections/hue',
    label: 'Philips Hue',
    eyebrow: 'Hardware Integration',
    description: 'Control smart lights and trigger visual alerts based on stream events.',
    section: 'configure',
    icon: HueIcon
  },
  {
    path: '/connections/elgato',
    label: 'Elgato',
    eyebrow: 'Hardware Integration',
    description: 'Control your Stream Deck, Key Lights, and Prompter setup.',
    section: 'configure',
    icon: ElgatoIcon
  },
  {
    path: '/connections/govee',
    label: 'Govee',
    eyebrow: 'Hardware Integration',
    description: 'Sync your Govee Glide, Lyra, and Immersion lights with stream alerts.',
    section: 'configure',
    icon: GoveeIcon
  },
  {
    path: '/connections/deskthing',
    label: 'DeskThing',
    eyebrow: 'Hardware Integration',
    description: 'Pair a Spotify Car Thing as a tactile soundboard and stream-deck remote.',
    section: 'configure',
    icon: DeskThingIcon
  },
  {
    path: '/connections/nanoleaf',
    label: 'Nanoleaf',
    eyebrow: 'Hardware Integration',
    description: 'Synchronize your Nanoleaf Shapes, Lines, and Canvas with your stream.',
    section: 'configure',
    icon: NanoleafIcon
  },
  {
    path: '/connections/lifx',
    label: 'LIFX',
    eyebrow: 'Hardware Integration',
    description: 'Connect and control your high-performance LIFX bulbs and strips.',
    section: 'configure',
    icon: LifxIcon
  },
  {
    path: '/connections/loupedeck',
    label: 'Loupedeck',
    eyebrow: 'Hardware Integration',
    description: 'Map stream actions and volume dials to your Loupedeck Live or CT.',
    section: 'configure',
    icon: LoupedeckIcon
  },
  {
    path: '/connections/razer',
    label: 'Razer Chroma',
    eyebrow: 'Hardware Integration',
    description: 'Synchronize your Razer peripherals with stream events via Chroma SDK.',
    section: 'configure',
    icon: RazerIcon
  },
  {
    path: '/connections/logitech',
    label: 'Logitech G',
    eyebrow: 'Hardware Integration',
    description: 'Sync your Logitech G peripherals with stream highlights and interactions.',
    section: 'configure',
    icon: LogitechIcon
  },
  {
    path: '/connections/yeelight',
    label: 'Yeelight',
    eyebrow: 'Hardware Integration',
    description: 'Connect and control your Yeelight bulbs via LAN protocol.',
    section: 'configure',
    icon: YeelightIcon
  },
  {
    path: '/connections/wiz',
    label: 'WiZ',
    eyebrow: 'Hardware Integration',
    description: 'Connect and control your WiZ smart lights via UDP protocol.',
    section: 'configure',
    icon: WizIcon
  },
  {
    path: '/connections/facebook',
    label: 'Facebook',
    eyebrow: 'Platform Wiring',
    description: 'Connect your Facebook Page or Gaming Creator profile.',
    section: 'configure',
    icon: FacebookPageIcon
  },
  {
    path: '/connections/instagram',
    label: 'Instagram',
    eyebrow: 'Platform Wiring',
    description: 'Broadcast vertically and interact with your Instagram followers.',
    section: 'configure',
    icon: InstagramPageIcon
  },
  {
    path: '/connections/restream',
    label: 'ReStream',
    eyebrow: 'Platform Wiring',
    description: 'Broadcast to multiple platforms simultaneously via ReStream hub.',
    section: 'configure',
    icon: RestreamPageIcon
  },
  {
    path: '/connections/linkedin',
    label: 'LinkedIn',
    eyebrow: 'Platform Wiring',
    description: 'Stream your professional workshops and coding sessions to LinkedIn.',
    section: 'configure',
    icon: LinkedinPageIcon
  },
  {
    path: '/connections/telegram',
    label: 'Telegram',
    eyebrow: 'Platform Wiring',
    description: 'Stream to your Telegram Channels and Groups securely.',
    section: 'configure',
    icon: TelegramPageIcon
  },
  {
    path: '/settings',
    label: 'Settings',
    eyebrow: 'Studio Config',
    description: 'Tune themes, runtime limits, broadcast defaults, OBS remote control, and overlay delivery.',
    section: 'configure',
    icon: Settings2
  },
  {
    path: '/widgets',
    label: 'Widgets',
    eyebrow: 'Overlay Assets',
    description: 'Configure interactive overlays, goals, and visual alerts for your stream.',
    section: 'configure',
    icon: Layers
  }
]

export function getNavigationItem(pathname: string): NavigationItem {
  const exactMatch = navigationItems.find((item) => item.path === pathname)
  if (exactMatch) {
    return exactMatch
  }

  const nestedMatch = navigationItems.find(
    (item) => item.path !== '/' && pathname.startsWith(item.path)
  )

  return nestedMatch ?? navigationItems[0]
}
