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
          template: 'GG!\n{username} sent {giftName} x{giftCount}',
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
          template: 'LIKE BURST\n{username} is pushing the live',
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
          template: 'Song request\n{username}\n{message}',
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
    id: 'song-request-host-reply',
    name: 'Song Request Host Reply',
    category: 'Spotify',
    eventType: 'chat',
    summary: 'Answers song request commands directly from the host chat account.',
    outcome: 'Sends a short confirmation in the same platform chat when the sender session is ready.',
    difficulty: 'Starter',
    accent: 'green',
    tags: ['spotify', 'host chat', 'confirmation'],
    simulation: {
      platform: 'tiktok',
      type: 'chat',
      username: 'music_fan',
      displayName: 'Music Fan',
      message: '!play Espresso'
    },
    rule: {
      name: 'Recipe: Song Request Host Reply',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'chat' },
        { type: 'keyword', value: '!play', matchMode: 'starts_with', caseSensitive: false }
      ],
      actions: [
        {
          type: 'send_chat',
          template: 'Got it {username}. I will try to queue that request now.',
          platform: 'source'
        }
      ],
      cooldown: 4,
      userCooldown: 15
    }
  },
  {
    id: 'ai-question-catcher',
    name: 'AI Question Catcher',
    category: 'Chat',
    eventType: 'chat',
    summary: 'Lets the AI co-host answer obvious chat questions without reacting to everything.',
    outcome: 'Generates a short AI answer in chat and TTS for messages that contain a question mark.',
    difficulty: 'Power',
    accent: 'violet',
    tags: ['ai', 'questions', 'chat'],
    simulation: {
      platform: 'twitch',
      type: 'chat',
      username: 'curious_viewer',
      displayName: 'Curious Viewer',
      message: 'what game are you playing?'
    },
    rule: {
      name: 'Recipe: AI Question Catcher',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'chat' },
        { type: 'keyword', value: '?', matchMode: 'contains', caseSensitive: false }
      ],
      actions: [
        {
          type: 'ai_respond',
          output: 'both',
          systemPrompt: 'Answer the viewer in one short sentence. Be helpful, warm, and safe for a livestream.'
        }
      ],
      cooldown: 20,
      userCooldown: 60
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
          template: 'SUPERFAN\n{username} joined the inner circle',
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
          template: 'RAID INCOMING\n{username} brought the crew',
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
          template: 'HELLO {username}\nWelcome to the stream',
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
          template: 'AUDIENCE MILESTONE\nThe room is filling up',
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
          template: 'NEW FOLLOW\n{username}',
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
  },
  {
    id: 'streamerbot-gift-action',
    name: 'Streamer.bot Gift Action',
    category: 'Overlays',
    eventType: 'gift',
    summary: 'A bridge recipe for creators who want Streamer.bot to fan out extra effects.',
    outcome: 'Posts a compact gift payload to a local bridge endpoint you can swap for your Streamer.bot setup.',
    difficulty: 'Advanced',
    accent: 'cyan',
    tags: ['streamerbot', 'bridge', 'gift'],
    simulation: {
      platform: 'tiktok',
      type: 'gift',
      username: 'bridge_tester',
      displayName: 'Bridge Tester',
      giftName: 'Rose',
      giftCount: 3
    },
    rule: {
      name: 'Recipe: Streamer.bot Gift Action',
      enabled: true,
      platforms: CORE_PLATFORMS,
      conditions: [
        { type: 'event_type', value: 'gift' }
      ],
      actions: [
        {
          type: 'http_webhook',
          url: 'http://127.0.0.1:8080/ilystream',
          method: 'POST',
          headers: {},
          body: '{"source":"ilyStream","event":"gift","platform":"{platform}","username":"{username}","giftName":"{giftName}","giftCount":"{giftCount}"}'
        }
      ],
      cooldown: 2,
      userCooldown: 4
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
