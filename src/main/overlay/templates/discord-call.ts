import {
  DEFAULT_DISCORD_CALL_CONFIG,
  type DiscordCallWidgetConfig,
  type Widget
} from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'
import { INLINE_AVATAR_RUNTIME_SCRIPT } from './runtime-assets'

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function color(value: unknown, fallback: string): string {
  const text = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback
}

function rgb(value: string): string {
  const hex = value.slice(1)
  return `${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)}`
}

function font(value: unknown, fallback: string): string {
  const text = String(value || '').trim()
  return /^[a-z0-9 _,-]+$/i.test(text) ? text : fallback
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character
  ))
}

export function buildDiscordCallHtml(widget: Widget, isPreview = false): string {
  const config: DiscordCallWidgetConfig = {
    ...DEFAULT_DISCORD_CALL_CONFIG,
    ...(widget.config as Partial<DiscordCallWidgetConfig> | undefined)
  }
  const layout = config.layout === 'speaker' || config.layout === 'row' ? config.layout : 'grid'
  const avatarShape = config.avatarShape === 'rounded' || config.avatarShape === 'square'
    ? config.avatarShape
    : 'circle'
  const avatarRadius = avatarShape === 'circle' ? '999px' : avatarShape === 'rounded' ? '18px' : '2px'
  const speakingColor = color(config.speakingColor, DEFAULT_DISCORD_CALL_CONFIG.speakingColor)
  const accentColor = color(config.accentColor, DEFAULT_DISCORD_CALL_CONFIG.accentColor)
  const backgroundColor = color(config.backgroundColor, DEFAULT_DISCORD_CALL_CONFIG.backgroundColor)
  const textColor = color(config.textColor, DEFAULT_DISCORD_CALL_CONFIG.textColor)
  const mutedColor = color(config.mutedColor, DEFAULT_DISCORD_CALL_CONFIG.mutedColor)
  const backgroundOpacity = clamp(config.backgroundOpacity, 0, 1, DEFAULT_DISCORD_CALL_CONFIG.backgroundOpacity)
  const glassIntensity = clamp(config.glassIntensity, 0, 1, DEFAULT_DISCORD_CALL_CONFIG.glassIntensity)
  const opacity = clamp(config.opacity, 0.1, 1, DEFAULT_DISCORD_CALL_CONFIG.opacity)
  const scale = clamp(config.scale, 0.25, 2, DEFAULT_DISCORD_CALL_CONFIG.scale)
  const panelWidth = Math.round(clamp(config.panelWidth, 240, 1200, DEFAULT_DISCORD_CALL_CONFIG.panelWidth))
  const panelMaxHeight = Math.round(clamp(config.panelMaxHeight, 140, 900, DEFAULT_DISCORD_CALL_CONFIG.panelMaxHeight))
  const outerPadding = Math.round(clamp(config.outerPadding, 0, 40, DEFAULT_DISCORD_CALL_CONFIG.outerPadding))
  const avatarSize = Math.round(clamp(config.avatarSize, 40, 160, DEFAULT_DISCORD_CALL_CONFIG.avatarSize))
  const gap = Math.round(clamp(config.cardGap, 4, 40, DEFAULT_DISCORD_CALL_CONFIG.cardGap))
  const padding = Math.round(clamp(config.cardPadding, 6, 32, DEFAULT_DISCORD_CALL_CONFIG.cardPadding))
  const radius = Math.round(clamp(config.borderRadius, 0, 48, DEFAULT_DISCORD_CALL_CONFIG.borderRadius))
  const maxParticipants = Math.round(clamp(config.maxParticipants, 1, 25, DEFAULT_DISCORD_CALL_CONFIG.maxParticipants))
  const fontFamily = font(config.fontFamily, DEFAULT_DISCORD_CALL_CONFIG.fontFamily)
  const previewState = {
    connectionPhase: 'connected',
    connectionMessage: 'Discord voice is connected.',
    channelId: 'preview-channel',
    channelName: 'Stream Room',
    guildId: 'preview-guild',
    isConnected: true,
    updatedAt: new Date(0).toISOString(),
    participants: [
      { id: '1', username: 'You', avatarUrl: null, isSpeaking: false, isMuted: false, isDeafened: false, isCurrentUser: true, linkedProfileName: null },
      { id: '2', username: 'ily friend', avatarUrl: null, isSpeaking: true, isMuted: false, isDeafened: false, isCurrentUser: false, linkedProfileName: 'ily friend' },
      { id: '3', username: 'co-host', avatarUrl: null, isSpeaking: false, isMuted: true, isDeafened: false, isCurrentUser: false, linkedProfileName: null },
      { id: '4', username: 'mod squad', avatarUrl: null, isSpeaking: false, isMuted: false, isDeafened: true, isCurrentUser: false, linkedProfileName: null }
    ]
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord Call</title>
  <style>
    :root {
      --accent: ${accentColor};
      --speaking: ${speakingColor};
      --muted: ${mutedColor};
      --text: ${textColor};
      --text-rgb: ${rgb(textColor)};
      --surface: rgba(${rgb(backgroundColor)}, ${backgroundOpacity});
      --surface-soft: rgba(${rgb(backgroundColor)}, ${Math.max(0.08, backgroundOpacity * 0.72)});
      --glass-blur: ${Math.round(glassIntensity * 36)}px;
      --radius: ${radius}px;
      --avatar-size: ${avatarSize}px;
      --avatar-radius: ${avatarRadius};
      --gap: ${gap}px;
      --card-padding: ${padding}px;
    }
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      min-width: 240px;
      min-height: 120px;
      margin: 0;
      overflow: hidden;
      background: transparent !important;
    }
    body {
      padding: ${outerPadding}px;
      color: var(--text);
      font-family: '${fontFamily}', Inter, Segoe UI, sans-serif;
      opacity: ${opacity};
      -webkit-font-smoothing: antialiased;
    }
    .call-stage {
      width: min(100%, ${panelWidth}px);
      max-height: min(100%, ${panelMaxHeight}px);
    }
    .call-stage.is-hidden { display: none; }
    .call-widget {
      width: 100%;
      max-height: ${panelMaxHeight}px;
      display: flex;
      flex-direction: column;
      transform: scale(${scale});
      transform-origin: top left;
      filter: drop-shadow(0 16px 38px rgba(0, 0, 0, 0.38));
    }
    ${getAnimationCss({ style: config.animationStyle || 'slide', duration: config.animationDuration || 450 }, '.call-stage')}
    .header {
      display: ${config.showHeader ? 'flex' : 'none'};
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      min-height: 54px;
      padding: 12px 16px;
      border: 1px solid rgba(var(--text-rgb), 0.12);
      border-bottom-color: rgba(var(--text-rgb), 0.06);
      border-radius: var(--radius) var(--radius) 0 0;
      background: var(--surface);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
    }
    .header-copy { min-width: 0; }
    .eyebrow {
      color: rgba(var(--text-rgb), 0.5);
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .channel {
      margin-top: 4px;
      overflow: hidden;
      font-size: 16px;
      font-weight: 800;
      line-height: 1.1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .member-count {
      flex: none;
      padding: 5px 9px;
      border: 1px solid rgba(var(--text-rgb), 0.1);
      border-radius: 999px;
      background: rgba(var(--text-rgb), 0.06);
      color: rgba(var(--text-rgb), 0.68);
      font-size: 11px;
      font-weight: 750;
    }
    .participants {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(${Math.max(118, avatarSize + 38)}px, 1fr));
      gap: var(--gap);
      min-height: 70px;
      padding: var(--gap);
      overflow: auto;
      border: 1px solid rgba(var(--text-rgb), 0.12);
      border-top: ${config.showHeader ? 'none' : '1px solid rgba(var(--text-rgb), 0.12)'};
      border-radius: ${config.showHeader ? '0 0 var(--radius) var(--radius)' : 'var(--radius)'};
      background: var(--surface-soft);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      scrollbar-width: none;
    }
    .participants::-webkit-scrollbar { display: none; }
    .participants.layout-row {
      grid-auto-flow: column;
      grid-auto-columns: minmax(${Math.max(112, avatarSize + 32)}px, 1fr);
      grid-template-columns: none;
      overflow-x: auto;
    }
    .participants.layout-speaker {
      grid-template-columns: repeat(auto-fit, minmax(${Math.max(104, avatarSize + 24)}px, 1fr));
    }
    .participant {
      position: relative;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: var(--card-padding);
      overflow: hidden;
      border: 1px solid rgba(var(--text-rgb), 0.09);
      border-radius: max(10px, calc(var(--radius) - 5px));
      background: rgba(var(--text-rgb), 0.045);
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
    }
    .layout-speaker .participant.is-speaking {
      grid-column: span 2;
      min-height: calc(var(--avatar-size) + 86px);
    }
    .participant.is-speaking {
      z-index: 2;
      border-color: rgba(${rgb(speakingColor)}, 0.78);
      background: rgba(${rgb(speakingColor)}, 0.11);
      transform: translateY(-2px);
      box-shadow: ${config.showSpeakingGlow ? `0 0 0 2px rgba(${rgb(speakingColor)}, 0.18), 0 0 26px rgba(${rgb(speakingColor)}, 0.34)` : 'none'};
    }
    .avatar-wrap {
      position: relative;
      width: var(--avatar-size);
      height: var(--avatar-size);
      flex: none;
    }
    .avatar {
      width: 100%;
      height: 100%;
      display: block;
      border: 2px solid rgba(var(--text-rgb), 0.13);
      border-radius: var(--avatar-radius);
      object-fit: cover;
      background: linear-gradient(145deg, rgba(${rgb(accentColor)}, 0.85), rgba(${rgb(speakingColor)}, 0.65));
    }
    .participant.is-speaking .avatar {
      border-color: var(--speaking);
    }
    .status-icons {
      position: absolute;
      right: -4px;
      bottom: -4px;
      display: ${config.showStatusIcons ? 'flex' : 'none'};
      gap: 3px;
    }
    .status-icon {
      width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      border: 2px solid rgba(${rgb(backgroundColor)}, 0.95);
      border-radius: 999px;
      background: var(--muted);
      color: white;
    }
    .status-icon svg { width: 11px; height: 11px; fill: currentColor; }
    .name-row {
      max-width: 100%;
      display: ${config.showNames ? 'flex' : 'none'};
      align-items: center;
      justify-content: center;
      gap: 5px;
    }
    .name {
      overflow: hidden;
      font-size: 13px;
      font-weight: 800;
      line-height: 1.15;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .you {
      flex: none;
      padding: 2px 4px;
      border-radius: 4px;
      background: rgba(${rgb(accentColor)}, 0.2);
      color: var(--accent);
      font-size: 8px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .speech-status {
      min-height: 12px;
      color: rgba(var(--text-rgb), 0.42);
      font-size: 9px;
      font-weight: 650;
      line-height: 1.1;
    }
    .participant.is-speaking .speech-status { color: var(--speaking); }
    .linked-dot {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 10px rgba(${rgb(accentColor)}, 0.8);
    }
    .empty-state {
      grid-column: 1 / -1;
      min-height: 82px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 14px;
      text-align: center;
    }
    .empty-title { font-size: 14px; font-weight: 800; }
    .empty-detail { max-width: 340px; color: rgba(var(--text-rgb), 0.5); font-size: 11px; line-height: 1.35; }
  </style>
</head>
<body>
  <div class="call-stage">
  <main class="call-widget">
    <header class="header">
      <div class="header-copy">
        <div class="eyebrow">${escapeHtml(config.title)}</div>
        <div class="channel"></div>
      </div>
      <div class="member-count"></div>
    </header>
    <section class="participants layout-${layout}"></section>
  </main>
  </div>
  ${INLINE_AVATAR_RUNTIME_SCRIPT}
  <script>
    (function () {
      var IS_PREVIEW = ${isPreview ? 'true' : 'false'};
      var PREVIEW_STATE = ${JSON.stringify(previewState)};
      var MAX_PARTICIPANTS = ${maxParticipants};
      var SHOW_CHANNEL = ${config.showChannelName ? 'true' : 'false'};
      var SHOW_OFFLINE = ${config.showOfflineState ? 'true' : 'false'};
      var USE_LINKED_NAMES = ${config.useLinkedProfileNames ? 'true' : 'false'};
      var participantRoot = document.querySelector('.participants');
      var channelRoot = document.querySelector('.channel');
      var countRoot = document.querySelector('.member-count');
      var stageRoot = document.querySelector('.call-stage');
      var speechMeta = {};
      var currentState = null;

      function iconMarkup(kind) {
        if (kind === 'deaf') return '<svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v4a3 3 0 0 0 3 3h1v-6H7v-1a5 5 0 0 1 10 0v1h-2v6h1.2l2.4 2.4 1.4-1.4-16-16L2.6 3.4 6 6.8A6.96 6.96 0 0 0 5 10v1H4v6h4v-5.2l9.6 9.6L19 20l-2.2-2.2A3 3 0 0 0 19 15v-5a7 7 0 0 0-7-7Z"/></svg>';
        return '<svg viewBox="0 0 24 24"><path d="M19 11h-2a5 5 0 0 1-8.5 3.5L7 16a7 7 0 0 0 4 1.9V21H8v2h8v-2h-3v-3.1a7 7 0 0 0 6-6.9ZM4.3 3 3 4.3l6 6V11a3 3 0 0 0 5.6 1.5l1.5 1.5A5 5 0 0 1 7 11H5a7 7 0 0 0 12.5 4.3L20.7 18 22 16.7 4.3 3ZM12 1a3 3 0 0 0-3 3v1.2l6 6V4a3 3 0 0 0-3-3Z"/></svg>';
      }

      function updateSpeechMeta(participants) {
        var now = Date.now();
        participants.forEach(function (participant) {
          var meta = speechMeta[participant.id] || { wasSpeaking: false, speakingSince: 0, lastSpokeAt: 0 };
          if (participant.isSpeaking && !meta.wasSpeaking) meta.speakingSince = now;
          if (!participant.isSpeaking && meta.wasSpeaking) meta.lastSpokeAt = now;
          meta.wasSpeaking = Boolean(participant.isSpeaking);
          speechMeta[participant.id] = meta;
        });
      }

      function speechLabel(participant) {
        var meta = speechMeta[participant.id] || {};
        var now = Date.now();
        if (participant.isSpeaking) {
          var seconds = Math.max(1, Math.floor((now - (meta.speakingSince || now)) / 1000) + 1);
          return 'Speaking now · ' + seconds + 's';
        }
        if (meta.lastSpokeAt && now - meta.lastSpokeAt < 60000) {
          return 'Spoke ' + Math.max(1, Math.floor((now - meta.lastSpokeAt) / 1000)) + 's ago';
        }
        return participant.isMuted ? 'Muted' : participant.isDeafened ? 'Deafened' : '';
      }

      function renderParticipant(participant) {
        var card = document.createElement('article');
        card.className = 'participant' + (participant.isSpeaking ? ' is-speaking' : '');
        card.dataset.userId = String(participant.id || '');

        if (participant.linkedProfileId) {
          var linked = document.createElement('span');
          linked.className = 'linked-dot';
          linked.title = 'Using linked ilyStream profile';
          card.appendChild(linked);
        }

        var avatarWrap = document.createElement('div');
        avatarWrap.className = 'avatar-wrap';
        var displayName = USE_LINKED_NAMES && participant.linkedProfileName ? participant.linkedProfileName : participant.username;
        var image = document.createElement('img');
        image.className = 'avatar';
        image.alt = '';
        window.__ilyAvatar.apply(image, displayName, participant.avatarUrl);
        avatarWrap.appendChild(image);

        if (participant.isMuted || participant.isDeafened) {
          var icons = document.createElement('span');
          icons.className = 'status-icons';
          if (participant.isMuted) {
            var muted = document.createElement('span');
            muted.className = 'status-icon';
            muted.title = 'Muted';
            muted.innerHTML = iconMarkup('mute');
            icons.appendChild(muted);
          }
          if (participant.isDeafened) {
            var deafened = document.createElement('span');
            deafened.className = 'status-icon';
            deafened.title = 'Deafened';
            deafened.innerHTML = iconMarkup('deaf');
            icons.appendChild(deafened);
          }
          avatarWrap.appendChild(icons);
        }
        card.appendChild(avatarWrap);

        var nameRow = document.createElement('div');
        nameRow.className = 'name-row';
        var name = document.createElement('span');
        name.className = 'name';
        name.textContent = displayName || participant.id || 'Discord user';
        nameRow.appendChild(name);
        if (participant.isCurrentUser) {
          var you = document.createElement('span');
          you.className = 'you';
          you.textContent = 'You';
          nameRow.appendChild(you);
        }
        card.appendChild(nameRow);

        var speech = document.createElement('div');
        speech.className = 'speech-status';
        speech.textContent = speechLabel(participant);
        card.appendChild(speech);
        return card;
      }

      function renderEmpty(state) {
        var empty = document.createElement('div');
        empty.className = 'empty-state';
        var title = document.createElement('div');
        title.className = 'empty-title';
        title.textContent = state && state.isConnected ? 'No active Discord call' : 'Discord voice is offline';
        var detail = document.createElement('div');
        detail.className = 'empty-detail';
        detail.textContent = state && state.connectionMessage ? state.connectionMessage : 'Connect Discord in ilyStream, then join a voice channel.';
        empty.appendChild(title);
        empty.appendChild(detail);
        participantRoot.appendChild(empty);
      }

      function render(state) {
        currentState = state || null;
        var allParticipants = state && Array.isArray(state.participants) ? state.participants.slice() : [];
        updateSpeechMeta(allParticipants);
        allParticipants.sort(function (left, right) {
          if (left.isSpeaking !== right.isSpeaking) return left.isSpeaking ? -1 : 1;
          if (left.isCurrentUser !== right.isCurrentUser) return left.isCurrentUser ? -1 : 1;
          return String(left.username || '').localeCompare(String(right.username || ''));
        });
        var participants = allParticipants.slice(0, MAX_PARTICIPANTS);

        participantRoot.textContent = '';
        stageRoot.className = 'call-stage' + (!participants.length && !SHOW_OFFLINE ? ' is-hidden' : '');
        channelRoot.textContent = SHOW_CHANNEL && state && state.channelName ? state.channelName : '${escapeHtml(config.title)}';
        countRoot.textContent = participants.length === allParticipants.length
          ? participants.length + (participants.length === 1 ? ' person' : ' people')
          : participants.length + '/' + allParticipants.length + ' people';
        if (!participants.length) {
          if (SHOW_OFFLINE) renderEmpty(state);
          return;
        }
        participants.forEach(function (participant) { participantRoot.appendChild(renderParticipant(participant)); });
      }

      function refreshSpeechLabels() {
        if (!currentState || !Array.isArray(currentState.participants)) return;
        var byId = {};
        currentState.participants.forEach(function (participant) { byId[participant.id] = participant; });
        var cards = participantRoot.querySelectorAll('.participant[data-user-id]');
        for (var index = 0; index < cards.length; index++) {
          var card = cards[index];
          var participant = byId[card.dataset.userId];
          var label = card.querySelector('.speech-status');
          if (participant && label) label.textContent = speechLabel(participant);
        }
      }

      function acceptPayload(payload) {
        if (!payload) return;
        if (payload.type === 'reload') { window.location.reload(); return; }
        if (payload.type === 'snapshot') { render(payload.payload); return; }
        if (Array.isArray(payload.participants)) render(payload);
      }

      if (IS_PREVIEW) {
        render(PREVIEW_STATE);
      } else {
        var source = new EventSource(new URL('/overlay/events?channel=discord-call', window.location.href).href);
        source.onmessage = function (event) {
          try { acceptPayload(JSON.parse(event.data)); } catch (error) {}
        };
      }

      setInterval(function () {
        refreshSpeechLabels();
      }, 1000);
    })();
  </script>
</body>
</html>`
}
