import {
  IconActivity,
  IconGift,
  IconHeart,
  IconMessage,
  IconShare,
  IconUserPlus,
  IconUsers
} from '@tabler/icons-react'
import type { EventLabTestEventType } from '../../../shared/event-lab'
import type { Platform } from '../../../main/platforms/types'
import type { EventLabEntryKind } from '../../stores/event-lab-store'

export const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']

export const EVENT_TYPES: EventLabTestEventType[] = [
  'chat',
  'gift',
  'like',
  'follow',
  'subscription',
  'superfan',
  'share',
  'raid',
  'join',
  'viewer-count'
]

export const QUICK_TESTS: Array<{ type: EventLabTestEventType; label: string; icon: typeof IconActivity }> = [
  { type: 'chat', label: 'Chat', icon: IconMessage },
  { type: 'gift', label: 'Gift', icon: IconGift },
  { type: 'like', label: 'Likes', icon: IconHeart },
  { type: 'follow', label: 'Follow', icon: IconUserPlus },
  { type: 'subscription', label: 'Sub', icon: IconUsers },
  { type: 'share', label: 'Share', icon: IconShare }
]

export const KIND_LABELS: Record<EventLabEntryKind | 'all', string> = {
  all: 'All',
  stream: 'Stream',
  overlay: 'Overlay',
  device: 'DeskThing',
  automation: 'Automation',
  alert: 'Alerts',
  sound: 'Sounds',
  tts: 'TTS',
  spotify: 'Spotify',
  status: 'Status',
  system: 'System'
}

export const REPLAY_SPEEDS = [0.5, 1, 2, 4]
