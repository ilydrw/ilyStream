import type { EventType, Platform } from '../../main/platforms/types'
import type { TriggerRule } from '../../main/triggers/trigger-types'
import type { EventLabSimulationPayload } from '../../shared/event-lab'

type RecipeTriggerTemplate = Omit<TriggerRule, 'id' | 'sortOrder'>

export interface AutomationRecipe {
  id: string
  name: string
  category: 'Alerts' | 'Chat' | 'Spotify' | 'Growth' | 'Overlays'
  eventType: EventType | 'superfan'
  summary: string
  outcome: string
  difficulty: 'Starter' | 'Power' | 'Advanced'
  accent: 'pink' | 'cyan' | 'green' | 'amber' | 'red' | 'violet'
  tags: string[]
  simulation: EventLabSimulationPayload
  rule: RecipeTriggerTemplate
}

const CORE_PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']

export const automationRecipes: AutomationRecipe[] = [
  {
    id: 'gift-gg-celebration',
    name: 'GG Gift Celebration',
    category: 'Alerts',
    eventType: 'gift',
    summary: 'A loud, replayable gift celebration tuned for TikTok GG-style moments.',
    outcome: 'Shows an animated gift alert, drops avatar physics, and speaks a short thank-you.',
    difficulty: 'Starter',
    accent: 'pink',
    tags: ['gift', 'alert', 'physics', 'tts'],
    simulation: {
      platform: 'tiktok',
      type: 'gift',
      username: 'gift_sender',
      displayName: 'Gift Sender',
      giftName: 'GG',
      giftCount: 1
    },
    rule: {
      name: 'Recipe: GG Gift Celebration',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'gift' },
        { type: 'gift_value_gte', value: 1 }
      ],
      actions: [
        {
          type: 'show_alert',
          template:
            '<div style="font-weight:900;font-size:42px;line-height:1;text-transform:uppercase;color:#fff;text-shadow:0 8px 28px rgba(208,53,241,.55);">GG!</div><div style="margin-top:10px;font-size:20px;color:#f7d7ff;">{username} sent {giftName} x{giftCount}</div>',
          durationMs: 5200,
          animationIn: 'bounce',
          animationOut: 'dissolve',
          audioVolume: 1
        },
        {
          type: 'physics_spawn',
          amount: 8
        },
        {
          type: 'tts',
          template: 'GG from {username}. Thanks for the {giftName} x{giftCount}.'
        }
      ],
      cooldown: 2,
      userCooldown: 6
    }
  },
  {
    id: 'like-burst-spotlight',
    name: 'Like Burst Spotlight',
    category: 'Growth',
    eventType: 'like',
    summary: 'Turns heavy like traffic into a clean periodic spotlight instead of constant noise.',
    outcome: 'Highlights a liker, adds a small avatar burst, and uses cooldowns to avoid spam.',
    difficulty: 'Starter',
    accent: 'red',
    tags: ['likes', 'anti-spam', 'overlay'],
    simulation: {
      platform: 'tiktok',
      type: 'like',
      username: 'like_leader',
      displayName: 'Like Leader',
      likeCount: 75,
      totalLikes: 4200
    },
    rule: {
      name: 'Recipe: Like Burst Spotlight',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'like' }
      ],
      actions: [
        {
          type: 'show_alert',
          template:
            '<div style="font-weight:900;font-size:28px;color:#fff;">LIKE BURST</div><div style="margin-top:8px;font-size:18px;color:#ffd6df;">{username} is pushing the live</div>',
          durationMs: 3600,
          animationIn: 'zoom',
          animationOut: 'fade',
          audioVolume: 0.8
        },
        {
          type: 'physics_spawn',
          amount: 4
        }
      ],
      cooldown: 20,
      userCooldown: 20
    }
  },
  {
    id: 'spotify-request-spotlight',
    name: 'Spotify Request Spotlight',
    category: 'Spotify',
    eventType: 'chat',
    summary: 'Adds visible feedback when chat uses the song request command.',
    outcome: 'Shows the request text in an overlay moment that can be verified in Event Lab.',
    difficulty: 'Starter',
    accent: 'green',
    tags: ['spotify', 'chat command', 'music'],
    simulation: {
      platform: 'twitch',
      type: 'chat',
      username: 'song_hunter',
      displayName: 'Song Hunter',
      message: '!play Blinding Lights'
    },
    rule: {
      name: 'Recipe: Spotify Request Spotlight',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'chat' },
        { type: 'keyword', value: '!play', matchMode: 'starts_with', caseSensitive: false }
      ],
      actions: [
        {
          type: 'show_alert',
          template:
            '<div style="font-size:18px;color:#7df58a;font-weight:900;text-transform:uppercase;">Song request</div><div style="margin-top:8px;font-size:24px;color:#fff;">{username}</div><div style="margin-top:6px;font-size:16px;color:#d8ffe1;">{message}</div>',
          durationMs: 4200,
          animationIn: 'slide',
          animationOut: 'fade',
          audioVolume: 0.7
        }
      ],
      cooldown: 3,
      userCooldown: 12
    }
  },
  {
    id: 'superfan-vip-pop',
    name: 'Superfan VIP Pop',
    category: 'Alerts',
    eventType: 'superfan',
    summary: 'Makes fan-club and superfan moments feel different from ordinary subs.',
    outcome: 'Checks for superfan-style badges, then fires a premium alert and TTS line.',
    difficulty: 'Power',
    accent: 'violet',
    tags: ['superfan', 'subscription', 'vip'],
    simulation: {
      platform: 'tiktok',
      type: 'superfan',
      username: 'superfan_max',
      displayName: 'Superfan Max',
      months: 6
    },
    rule: {
      name: 'Recipe: Superfan VIP Pop',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'subscription' },
        { type: 'user_status', status: 'is_super_fan' }
      ],
      actions: [
        {
          type: 'show_alert',
          template:
            '<div style="font-weight:900;font-size:34px;color:#fff;">SUPERFAN</div><div style="margin-top:8px;font-size:22px;color:#ead7ff;">{username} joined the inner circle</div>',
          durationMs: 6200,
          animationIn: 'wave',
          animationOut: 'dissolve',
          audioVolume: 1
        },
        {
          type: 'tts',
          template: 'Superfan alert. {username} has been here for {months} months.'
        }
      ],
      cooldown: 4,
      userCooldown: 20
    }
  },
  {
    id: 'raid-takeover',
    name: 'Raid Takeover',
    category: 'Overlays',
    eventType: 'raid',
    summary: 'A full-screen welcome beat for raids with enough viewers to matter.',
    outcome: 'Requires at least five raiders, then fires a takeover alert and avatar burst.',
    difficulty: 'Power',
    accent: 'cyan',
    tags: ['raid', 'growth', 'overlay'],
    simulation: {
      platform: 'twitch',
      type: 'raid',
      username: 'raider_live',
      displayName: 'Raider Live',
      viewerCount: 24
    },
    rule: {
      name: 'Recipe: Raid Takeover',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'raid' },
        { type: 'viewer_count_gte', value: 5 }
      ],
      actions: [
        {
          type: 'show_alert',
          template:
            '<div style="font-weight:900;font-size:36px;color:#fff;">RAID INCOMING</div><div style="margin-top:8px;font-size:20px;color:#ccf7ff;">{username} brought the crew</div>',
          durationMs: 6500,
          animationIn: 'slide',
          animationOut: 'dissolve',
          audioVolume: 1
        },
        {
          type: 'physics_spawn',
          amount: 12
        },
        {
          type: 'tts',
          template: 'Raid incoming from {username}. Welcome in everyone.'
        }
      ],
      cooldown: 10,
      userCooldown: 60
    }
  },
  {
    id: 'hello-command-hook',
    name: 'Hello Command Hook',
    category: 'Chat',
    eventType: 'chat',
    summary: 'A friendly starter chat command that proves command triggers are wired.',
    outcome: 'Responds to !hello with a small alert and spoken welcome.',
    difficulty: 'Starter',
    accent: 'amber',
    tags: ['chat', 'command', 'tts'],
    simulation: {
      platform: 'kick',
      type: 'chat',
      username: 'new_viewer',
      displayName: 'New Viewer',
      message: '!hello'
    },
    rule: {
      name: 'Recipe: Hello Command Hook',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'chat' },
        { type: 'keyword', value: '!hello', matchMode: 'exact', caseSensitive: false }
      ],
      actions: [
        {
          type: 'show_alert',
          template:
            '<div style="font-weight:900;font-size:26px;color:#fff;">HELLO {username}</div><div style="margin-top:6px;font-size:15px;color:#ffe6b0;">Welcome to the stream</div>',
          durationMs: 3600,
          animationIn: 'fade',
          animationOut: 'fade',
          audioVolume: 0.6
        },
        {
          type: 'tts',
          template: 'Welcome in, {username}.'
        }
      ],
      cooldown: 2,
      userCooldown: 30
    }
  },
  {
    id: 'viewer-count-milestone',
    name: 'Viewer Count Milestone',
    category: 'Growth',
    eventType: 'viewer-count',
    summary: 'Celebrates when live audience count crosses a chosen threshold.',
    outcome: 'Uses a viewer-count condition and a restrained overlay celebration.',
    difficulty: 'Advanced',
    accent: 'cyan',
    tags: ['viewer count', 'milestone', 'growth'],
    simulation: {
      platform: 'youtube',
      type: 'viewer-count',
      viewerCount: 75
    },
    rule: {
      name: 'Recipe: Viewer Count Milestone',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'viewer-count' },
        { type: 'viewer_count_gte', value: 50 }
      ],
      actions: [
        {
          type: 'show_alert',
          template:
            '<div style="font-weight:900;font-size:30px;color:#fff;">AUDIENCE MILESTONE</div><div style="margin-top:8px;font-size:18px;color:#ccf7ff;">The room is filling up</div>',
          durationMs: 4200,
          animationIn: 'zoom',
          animationOut: 'fade',
          audioVolume: 0.7
        },
        {
          type: 'tts',
          template: 'Audience milestone reached. The room is filling up.'
        }
      ],
      cooldown: 120,
      userCooldown: 0
    }
  },
  {
    id: 'follow-welcome-pop',
    name: 'Follower Welcome Pop',
    category: 'Growth',
    eventType: 'follow',
    summary: 'A lightweight follow acknowledgement that will not dominate the stream.',
    outcome: 'Shows a compact follow alert and drops a few avatar objects.',
    difficulty: 'Starter',
    accent: 'green',
    tags: ['follow', 'welcome', 'overlay'],
    simulation: {
      platform: 'youtube',
      type: 'follow',
      username: 'fresh_follow',
      displayName: 'Fresh Follow'
    },
    rule: {
      name: 'Recipe: Follower Welcome Pop',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'follow' }
      ],
      actions: [
        {
          type: 'show_alert',
          template:
            '<div style="font-weight:900;font-size:25px;color:#fff;">NEW FOLLOW</div><div style="margin-top:6px;font-size:18px;color:#d8ffe1;">{username}</div>',
          durationMs: 3400,
          animationIn: 'slide',
          animationOut: 'fade',
          audioVolume: 0.6
        },
        {
          type: 'physics_spawn',
          amount: 3
        }
      ],
      cooldown: 2,
      userCooldown: 30
    }
  }
]

export function createRecipeRule(recipe: AutomationRecipe, sortOrder: number, id = createRuleId()): TriggerRule {
  return {
    id,
    sortOrder,
    ...clone(recipe.rule),
    platforms: [...recipe.rule.platforms],
    conditions: clone(recipe.rule.conditions),
    actions: clone(recipe.rule.actions)
  }
}

export function getRecipeEventLabel(recipe: AutomationRecipe): string {
  return recipe.eventType === 'superfan' ? 'subscription + superfan' : recipe.eventType.replace('-', ' ')
}

function createRuleId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
