import {
  DEFAULT_BORDER_CONFIG,
  DEFAULT_CHAT_CONFIG,
  DEFAULT_CHAT_UNIFIED_CONFIG,
  DEFAULT_DISCORD_PROMO_CONFIG,
  DEFAULT_FOLLOWER_GOAL_CONFIG,
  DEFAULT_LATEST_GIFTER_CONFIG,
  DEFAULT_LEADERBOARD_CONFIG,
  DEFAULT_LIKES_TRACKER_CONFIG,
  DEFAULT_NODE_NETWORK_CONFIG,
  DEFAULT_NOW_PLAYING_CONFIG,
  DEFAULT_PARTICLE_CONFIG,
  DEFAULT_PARTICLES_CONFIG,
  DEFAULT_PHYSICS_CONFIG,
  DEFAULT_ROSE_CONFIG,
  DEFAULT_SOCIALS_CONFIG,
  type Widget,
  type WidgetType
} from '../../shared/widgets'
import { buildAlertsOverlayHtml } from './templates/alerts'
import { buildChatOverlayHtml } from './templates/chat'
import { buildChatWidgetHtml } from './templates/chat-widget'
import { buildDeckHtml } from './templates/deck'
import { buildDiscordPromoHtml } from './templates/discord-promo'
import { buildParticleOverlayHtml } from './templates/event-particles'
import { buildRoseOverlayHtml } from './templates/falling-roses'
import { buildFollowerGoalHtml } from './templates/follower-goal'
import { buildGoalsOverlayHtml } from './templates/goals'
import { buildLatestGifterHtml } from './templates/latest-gifter'
import { buildLeaderboardHtml } from './templates/leaderboard'
import { buildLikesTrackerHtml } from './templates/likes-tracker'
import { buildNodeNetworkHtml } from './templates/node-network'
import { buildNowPlayingOverlayHtml } from './templates/now-playing'
import { buildParticlesOverlayHtml } from './templates/particles'
import { buildPhysicsOverlayHtml } from './templates/physics'
import { buildScreenBorderHtml } from './templates/screen-border'
import { buildSocialsOverlayHtml } from './templates/socials'

export const WIDGET_ALIAS_MAP: Record<string, WidgetType | 'deck'> = {
  chat: 'chat',
  alerts: 'alerts',
  spotify: 'now-playing',
  'unified-chat': 'chat-unified',
  'likes-tracker': 'likes-tracker',
  likes: 'likes-tracker',
  goals: 'goal',
  'now-playing': 'now-playing',
  'follower-goal': 'follower-goal',
  followers: 'follower-goal',
  socials: 'socials',
  'screen-border': 'screen-border',
  border: 'screen-border',
  'event-particles': 'event-particles',
  hearts: 'event-particles',
  'gift-overlays': 'event-particles',
  'falling-roses': 'falling-roses',
  roses: 'falling-roses',
  'tiktok-roses': 'falling-roses',
  particles: 'particles',
  'discord-promo': 'discord-promo',
  discord: 'discord-promo',
  'node-network': 'node-network',
  nodes: 'node-network',
  web: 'node-network',
  'latest-gifter': 'latest-gifter',
  gifter: 'latest-gifter',
  deck: 'deck',
  physics: 'physics',
  leaderboard: 'leaderboard',
  'chat-unified': 'chat-unified',
  'chat-v2': 'chat-unified',
  unified: 'chat-unified'
}

export interface OverlayRendererContext {
  settings: Record<string, unknown>
  boardSounds: unknown[]
  deckActions: unknown[]
}

export function getDefaultWidgetConfig(type: WidgetType): any {
  switch (type) {
    case 'chat': return DEFAULT_CHAT_CONFIG
    case 'event-particles': return DEFAULT_PARTICLE_CONFIG
    case 'falling-roses': return DEFAULT_ROSE_CONFIG
    case 'particles': return DEFAULT_PARTICLES_CONFIG
    case 'screen-border': return DEFAULT_BORDER_CONFIG
    case 'follower-goal': return DEFAULT_FOLLOWER_GOAL_CONFIG
    case 'socials': return DEFAULT_SOCIALS_CONFIG
    case 'now-playing': return DEFAULT_NOW_PLAYING_CONFIG
    case 'discord-promo': return DEFAULT_DISCORD_PROMO_CONFIG
    case 'node-network': return DEFAULT_NODE_NETWORK_CONFIG
    case 'latest-gifter': return DEFAULT_LATEST_GIFTER_CONFIG
    case 'physics': return DEFAULT_PHYSICS_CONFIG
    case 'leaderboard': return DEFAULT_LEADERBOARD_CONFIG
    case 'chat-unified': return DEFAULT_CHAT_UNIFIED_CONFIG
    case 'likes-tracker': return DEFAULT_LIKES_TRACKER_CONFIG
    default: return {}
  }
}

export function generateOverlayHtml(
  widget: Widget,
  isPreview: boolean,
  context: OverlayRendererContext
): string | null {
  const type = widget.type === ('gift-overlays' as any) ? 'event-particles' : widget.type
  const config = type === 'alerts'
    ? { ...widget.config, ...context.settings }
    : widget.config

  switch (type) {
    case 'chat': return buildChatOverlayHtml(widget, isPreview)
    case 'alerts': return buildAlertsOverlayHtml({ ...widget, config }, isPreview)
    case 'goal': return buildGoalsOverlayHtml(widget, isPreview)
    case 'follower-goal': return buildFollowerGoalHtml(widget, isPreview)
    case 'socials': return buildSocialsOverlayHtml(widget, isPreview)
    case 'now-playing': return buildNowPlayingOverlayHtml(widget)
    case 'screen-border': return buildScreenBorderHtml(widget, isPreview)
    case 'event-particles': return buildParticleOverlayHtml(widget, isPreview)
    case 'falling-roses': return buildRoseOverlayHtml(widget, isPreview)
    case 'particles': return buildParticlesOverlayHtml(widget, isPreview)
    case 'discord-promo': return buildDiscordPromoHtml(widget, isPreview)
    case 'node-network': return buildNodeNetworkHtml(widget, isPreview)
    case 'latest-gifter': return buildLatestGifterHtml(widget, isPreview)
    case 'physics': return buildPhysicsOverlayHtml(widget, isPreview)
    case 'deck': return buildDeckHtml(context.boardSounds, context.deckActions)
    case 'leaderboard': return buildLeaderboardHtml()
    case 'chat-unified': return buildChatWidgetHtml(widget, isPreview)
    case 'likes-tracker': return buildLikesTrackerHtml(widget, isPreview)
    default: return null
  }
}

export function buildOverlayDirectoryHtml(widgetId?: string): string {
  const cards = Object.keys(WIDGET_ALIAS_MAP).sort().map((key) => {
    const icons: Record<string, string> = {
      likes: '❤️',
      chat: '💬',
      alerts: '🔔',
      spotify: '🎵',
      goals: '🎯',
      socials: '📱',
      border: '🖼️',
      roses: '🌹'
    }
    return `
      <a href="/overlay/${key}" class="card">
        <div class="icon">${icons[key] || '🔗'}</div>
        <div class="name">${key.replace(/-/g, ' ')}</div>
      </a>
    `
  }).join('')

  return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>IlyStream | Overlay Directory</title>
      <style>
        body {
          margin: 0;
          background: #050505;
          color: white;
          font-family: Inter, Outfit, Segoe UI, system-ui, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .container {
          max-width: 800px;
          width: 90%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        h1 { margin: 0 0 10px; font-size: 32px; font-weight: 800; }
        p.subtitle { color: rgba(255,255,255,0.5); margin: 0 0 32px; font-size: 16px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
        .card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 20px;
          text-decoration: none;
          color: white;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .card:hover { background: rgba(255,255,255,0.1); border-color: #19c8ff; transform: translateY(-3px); }
        .icon { font-size: 24px; margin-bottom: 12px; }
        .name { font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
        .error-box {
          background: rgba(254, 44, 85, 0.1);
          border-left: 4px solid #fe2c55;
          padding: 15px 20px;
          margin-bottom: 30px;
          border-radius: 8px;
        }
        .error-box b { color: #fe2c55; }
      </style>
    </head>
    <body>
      <div class="container">
        ${widgetId && widgetId !== 'overlay' && widgetId !== 'widget' ? `
          <div class="error-box"><b>Unknown Path:</b> The widget ID "${escapeHtml(widgetId)}" was not found.</div>
        ` : ''}
        <h1>Overlay Directory</h1>
        <p class="subtitle">Select a widget to open it in a new tab for OBS.</p>
        <div class="grid">${cards}</div>
      </div>
    </body>
    </html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
