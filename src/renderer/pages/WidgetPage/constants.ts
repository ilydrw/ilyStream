import {IconMessageCircle, IconBell, IconUsers, IconChartBar, IconMusic, IconShare, IconLayout, IconSparkles, IconBolt, IconTrophy, IconMessage, IconHeart} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import {
  DEFAULT_NOW_PLAYING_CONFIG,
  DEFAULT_CHAT_CONFIG,
  DEFAULT_FOLLOWER_GOAL_CONFIG,
  DEFAULT_SOCIALS_CONFIG,
  DEFAULT_BORDER_CONFIG,
  DEFAULT_PARTICLES_CONFIG,
  DEFAULT_DISCORD_PROMO_CONFIG,
  DEFAULT_NODE_NETWORK_CONFIG,
  DEFAULT_LATEST_GIFTER_CONFIG,
  DEFAULT_PHYSICS_CONFIG,
  DEFAULT_LEADERBOARD_CONFIG,
  DEFAULT_CHAT_UNIFIED_CONFIG,
  DEFAULT_LIKES_TRACKER_CONFIG,
  type WidgetType
} from '../../../shared/widgets'

export interface WidgetTemplate {
  type: WidgetType
  label: string
  icon: Icon
  description: string
  defaultConfig: Record<string, unknown>
}

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    type: 'chat',
    label: 'Unified Chat',
    icon: IconMessageCircle,
    description: 'Live cross-platform chat feed with glassmorphism styling.',
    defaultConfig: DEFAULT_CHAT_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'alerts',
    label: 'Event Alerts',
    icon: IconBell,
    description: 'Visual popups for gifts, follows, and subscribers.',
    defaultConfig: {}
  },
  {
    type: 'follower-goal',
    label: 'Follower Goal',
    icon: IconUsers,
    description: 'Real-time follower count progress bar with custom target.',
    defaultConfig: DEFAULT_FOLLOWER_GOAL_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'goal',
    label: 'Goal Tracker',
    icon: IconChartBar,
    description: 'Progress bar toward a follower / sub / gift goal.',
    defaultConfig: { goalType: 'follows', target: 100, accentColor: '#00ff9d' }
  },
  {
    type: 'now-playing',
    label: 'Now Playing',
    icon: IconMusic,
    description: 'Live Spotify track display with album art and requester credit.',
    defaultConfig: DEFAULT_NOW_PLAYING_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'socials',
    label: 'Socials Rotation',
    icon: IconShare,
    description: 'Animated loop showcasing your social media handles.',
    defaultConfig: DEFAULT_SOCIALS_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'screen-border',
    label: 'Screen Border',
    icon: IconLayout,
    description: 'Animated RGB or Cyber frame for vertical/TikTok streams.',
    defaultConfig: DEFAULT_BORDER_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'particles',
    label: 'Particles',
    icon: IconSparkles,
    description: 'Mix and match particle effects — hearts, roses, galaxy, GG\'s, and more.',
    defaultConfig: DEFAULT_PARTICLES_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'discord-promo',
    label: 'Discord Promo',
    icon: IconMessageCircle,
    description: 'Showcase your Discord server with a call to action for the bio link.',
    defaultConfig: DEFAULT_DISCORD_PROMO_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'node-network',
    label: 'Node Network',
    icon: IconLayout,
    description: 'A drifting node field for technical, high-motion scene backgrounds.',
    defaultConfig: DEFAULT_NODE_NETWORK_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'latest-gifter',
    label: 'Latest Gifter',
    icon: IconSparkles,
    description: 'Displays the most recent gift sender with a shimmering animation.',
    defaultConfig: DEFAULT_LATEST_GIFTER_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'physics',
    label: 'Physics Field',
    icon: IconBolt,
    description: 'A physics-based overlay where viewer profile pictures fall and collide.',
    defaultConfig: DEFAULT_PHYSICS_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'leaderboard',
    label: 'Likeathon Board',
    icon: IconTrophy,
    description: 'Session economy leaderboard fed by the likeathon engine.',
    defaultConfig: DEFAULT_LEADERBOARD_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'likes-tracker',
    label: 'Like Tracker',
    icon: IconHeart,
    description: 'Live TikTok-style top likers widget with total likes and animated rank changes.',
    defaultConfig: DEFAULT_LIKES_TRACKER_CONFIG as unknown as Record<string, unknown>
  },
  {
    type: 'chat-unified',
    label: 'Ninja Chat Feed',
    icon: IconMessage,
    description: 'High-performance unified chat with featured message highlights.',
    defaultConfig: DEFAULT_CHAT_UNIFIED_CONFIG as unknown as Record<string, unknown>
  }
]
