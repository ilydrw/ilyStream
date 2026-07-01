import {
  DEFAULT_LIKES_TRACKER_CONFIG,
  type LikesTrackerConfig,
  type Widget
} from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return Math.min(max, Math.max(min, numericValue))
}

function safeHexColor(value: unknown, fallback: string): string {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
}

function hexToRgb(color: string): string {
  const normalized = color.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ))
}

function safeFontFamily(value: unknown, fallback: string): string {
  const font = String(value || fallback).trim()
  return /^[a-z0-9 _,-]+$/i.test(font) ? font : fallback
}

export function buildLikesTrackerHtml(widget: Widget, isPreview: boolean = false): string {
  const config: LikesTrackerConfig = {
    ...DEFAULT_LIKES_TRACKER_CONFIG,
    ...(widget.config as Partial<LikesTrackerConfig> | undefined)
  }
  const rawTitle = String(config.title || DEFAULT_LIKES_TRACKER_CONFIG.title)
  const rawLifetimeTitle = String(config.lifetimeTitle || DEFAULT_LIKES_TRACKER_CONFIG.lifetimeTitle)
  const title = escapeHtml(rawTitle)
  const lifetimeCycleEnabled = config.lifetimeGlimpseEnabled !== false
  const streamWindowMinutes = clampNumber(config.streamWindowMinutes, 1, 60, DEFAULT_LIKES_TRACKER_CONFIG.streamWindowMinutes)
  const lifetimeWindowMinutes = clampNumber(config.lifetimeWindowMinutes, 1, 60, DEFAULT_LIKES_TRACKER_CONFIG.lifetimeWindowMinutes)
  const showPulsingHeart = config.showPulsingHeart !== false
  const maxVisible = Math.round(clampNumber(config.maxAvatars, 1, 25, DEFAULT_LIKES_TRACKER_CONFIG.maxAvatars))
  const accentColor = safeHexColor(config.accentColor, DEFAULT_LIKES_TRACKER_CONFIG.accentColor)
  const secondaryColor = safeHexColor(config.secondaryColor, DEFAULT_LIKES_TRACKER_CONFIG.secondaryColor)
  const backgroundColor = safeHexColor(config.backgroundColor, DEFAULT_LIKES_TRACKER_CONFIG.backgroundColor)
  const textColor = safeHexColor(config.textColor, DEFAULT_LIKES_TRACKER_CONFIG.textColor)
  const crownColor = safeHexColor(config.crownColor, DEFAULT_LIKES_TRACKER_CONFIG.crownColor)
  const opacity = clampNumber(config.opacity, 0.1, 1, DEFAULT_LIKES_TRACKER_CONFIG.opacity)
  const scale = clampNumber(config.scale, 0.5, 2, DEFAULT_LIKES_TRACKER_CONFIG.scale)
  const showTotal = config.showTotal !== false
  const showHeader = config.showHeader !== false
  const showRankNumbers = config.showRankNumbers !== false
  const showFirstPlaceCrown = config.showFirstPlaceCrown !== false
  const avatarShape = config.avatarShape === 'square' ? 'square' : 'circle'
  const borderRadius = clampNumber(config.borderRadius, 0, 50, DEFAULT_LIKES_TRACKER_CONFIG.borderRadius)
  const glassIntensity = clampNumber(config.glassIntensity, 0, 1, DEFAULT_LIKES_TRACKER_CONFIG.glassIntensity)
  const rowHeight = Math.round(clampNumber(config.rowHeight, 44, 88, DEFAULT_LIKES_TRACKER_CONFIG.rowHeight))
  const avatarSize = Math.round(clampNumber(config.avatarSize, 28, 64, DEFAULT_LIKES_TRACKER_CONFIG.avatarSize))
  const fontFamily = safeFontFamily(config.fontFamily, DEFAULT_LIKES_TRACKER_CONFIG.fontFamily)
  const backgroundRgb = hexToRgb(backgroundColor)
  const textRgb = hexToRgb(textColor)
  const avatarRadius = avatarShape === 'circle' ? '999px' : '0px'
  const bodyPadding = 15
  const widgetWidth = 320
  const headerHeight = showHeader ? 50 : 0
  const sourceMinWidth = Math.ceil((bodyPadding * 2) + (widgetWidth * scale))
  const sourceMinHeight = Math.ceil((bodyPadding * 2) + ((headerHeight + rowHeight) * scale))
  const crownMarkup = showFirstPlaceCrown
    ? '<span class="first-place-crown" aria-hidden="true"><svg viewBox="0 0 24 18" focusable="false"><path d="M2 16h20v2H2v-2Zm1-13 5.6 5.2L12 1l3.4 7.2L21 3l-2.2 11H5.2L3 3Z"/></svg></span>'
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Tikfinity-style Likes Leaderboard</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500;700&display=swap');

    :root {
      --bg-color: rgba(0, 0, 0, 0);
      --tiktok-pink: #fe2c55;
      --tiktok-cyan: #25f4ee;
      --text-color: ${textColor};
      --muted-text-color: rgba(${textRgb}, 0.58);
      --glass-bg: rgba(${backgroundRgb}, ${0.38 + (glassIntensity * 0.42)});
      --glass-blur: ${glassIntensity * 40}px;
      --glass-border: rgba(${textRgb}, ${0.05 + (glassIntensity * 0.12)});
      --row-height: ${rowHeight}px;
      --visible-rows: ${maxVisible};
      --avatar-size: ${avatarSize}px;
      --avatar-radius: ${avatarRadius};
      --accent-color: ${accentColor};
      --accent-gradient: linear-gradient(135deg, var(--accent-color), ${secondaryColor});
      --gold: ${crownColor};
      --silver: #e0e0e0;
      --bronze: #cd7f32;
      --border-radius: ${borderRadius}px;
      --font-main: '${fontFamily}', 'Inter', sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      height: 100%;
      min-width: ${sourceMinWidth}px;
      min-height: ${sourceMinHeight}px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent !important;
    }

    body {
      padding: ${bodyPadding}px;
      background: var(--bg-color);
      font-family: var(--font-main);
      color: var(--text-color);
      -webkit-font-smoothing: antialiased;
      opacity: ${opacity};
    }

    .leaderboard-wrapper {
      width: ${widgetWidth}px;
      display: flex;
      flex-direction: column;
      filter: drop-shadow(0 10px 30px rgba(0,0,0,0.5));
      transform: scale(${scale});
      transform-origin: top left;
    }
    ${getAnimationCss({ style: config.animationStyle || 'slide', duration: config.animationDuration || 800 }, '.leaderboard-wrapper')}

    .header {
      padding: 15px 20px;
      background: var(--glass-bg);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      border-radius: var(--border-radius) var(--border-radius) 0 0;
      border: 1px solid var(--glass-border);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      overflow: hidden;
    }

    .header::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 2px;
      background: var(--accent-gradient);
    }

    .header-title {
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
      color: var(--text-color);
    }

    .header-total {
      font-size: 18px;
      font-weight: 800;
      color: var(--text-color);
      display: flex;
      align-items: center;
      gap: 10px;
      font-variant-numeric: tabular-nums;
      display: ${showTotal ? 'flex' : 'none'};
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #444;
      transition: all 0.3s ease;
    }

    .status-dot.connected {
      background: #00ffa3;
      box-shadow: 0 0 10px #00ffa3;
    }

    .status-dot.error {
      background: var(--accent-color);
      box-shadow: 0 0 10px var(--accent-color);
    }

    .user-list {
      position: relative;
      background: var(--glass-bg);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      border-radius: 0 0 var(--border-radius) var(--border-radius);
      border: 1px solid var(--glass-border);
      border-top: none;
      height: calc(var(--row-height) * var(--visible-rows));
      min-height: var(--row-height);
      overflow: hidden;
    }

    .empty-state {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 20px;
      color: rgba(${textRgb}, 0.62);
      font-size: 14px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0;
    }

    .user-list.has-users .empty-state {
      display: none;
    }

    .leaderboard-wrapper.header-hidden .header {
      display: none;
    }

    .leaderboard-wrapper.header-hidden .user-list {
      border-radius: var(--border-radius);
      border-top: 1px solid var(--glass-border);
    }

    .user-row {
      position: absolute;
      left: 0;
      right: 0;
      height: var(--row-height);
      display: flex;
      align-items: center;
      padding: 0 18px;
      box-sizing: border-box;
      transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease;
      border-bottom: 1px solid rgba(${textRgb}, 0.035);
    }

    .rank {
      width: 28px;
      font-size: 16px;
      font-weight: 800;
      color: var(--muted-text-color);
      font-family: 'Outfit', sans-serif;
      display: ${showRankNumbers ? 'block' : 'none'};
    }

    .rank-1 .rank { color: var(--gold); font-size: 20px; }
    .rank-2 .rank { color: var(--silver); }
    .rank-3 .rank { color: var(--bronze); }

    .avatar-wrapper {
      position: relative;
      width: var(--avatar-size);
      height: var(--avatar-size);
      margin: 0 14px;
      flex: 0 0 var(--avatar-size);
    }

    .leaderboard-wrapper.no-ranks .avatar-wrapper {
      margin-left: 0;
    }

    .user-avatar {
      width: var(--avatar-size);
      height: var(--avatar-size);
      border-radius: var(--avatar-radius);
      border: 2px solid rgba(${textRgb}, 0.12);
      display: block;
      object-fit: cover;
      transition: all 0.3s ease;
    }

    .rank-1 .user-avatar {
      border-color: var(--gold);
      box-shadow: 0 0 15px rgba(${hexToRgb(crownColor)}, 0.3);
      transform: scale(1.1);
    }

    .first-place-crown {
      position: absolute;
      top: -13px;
      right: -10px;
      width: 20px;
      height: 16px;
      display: none;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.45));
      transform: rotate(12deg);
      z-index: 2;
    }

    .first-place-crown svg {
      display: block;
      width: 100%;
      height: 100%;
      fill: var(--gold);
    }

    .rank-1 .first-place-crown {
      display: block;
    }

    .user-info {
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-size: 15px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      color: rgba(${textRgb}, 0.92);
    }

    .user-score {
      font-size: 16px;
      font-weight: 800;
      color: var(--accent-color);
      text-align: right;
      padding-left: 10px;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 0 10px rgba(${hexToRgb(accentColor)}, 0.2);
    }

    .particle {
      position: fixed;
      pointer-events: none;
      font-size: 20px;
      z-index: 1000;
      animation: floatUp 1s ease-out forwards;
    }

    @keyframes floatUp {
      0% { transform: translate(0, 0) scale(0.5) rotate(0deg); opacity: 0; }
      20% { opacity: 1; transform: translate(0, 0) scale(1.2) rotate(10deg); }
      100% { transform: translate(var(--dx), var(--dy)) scale(0) rotate(45deg); opacity: 0; }
    }

    /* Tikfinity-style pulsing heart next to the total counter. Pulse rate
       is driven from JS via --heart-pulse-duration so heavy bursts feel
       frantic and quiet moments feel calm. */
    .header-heart {
      display: ${showPulsingHeart ? 'inline-flex' : 'none'};
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      color: var(--accent-color);
      animation: heart-pulse var(--heart-pulse-duration, 1.4s) ease-in-out infinite;
      filter: drop-shadow(0 0 6px rgba(${hexToRgb(accentColor)}, 0.55));
      transform-origin: center;
    }
    .header-heart svg { display: block; width: 100%; height: 100%; fill: currentColor; }

    @keyframes heart-pulse {
      0%, 100% { transform: scale(1); }
      30%      { transform: scale(1.28); }
      50%      { transform: scale(0.92); }
      70%      { transform: scale(1.12); }
    }

    /* One-shot burst overlaid on top of the steady pulse when a like lands. */
    @keyframes heart-burst {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.8); }
      100% { transform: scale(1); }
    }
    .header-heart.is-bursting { animation: heart-burst 360ms cubic-bezier(0.34, 1.56, 0.64, 1); }

    /* Ring of accent color expanding off the avatar of whoever just liked. */
    @keyframes avatar-ping {
      0%   { box-shadow: 0 0 0 0 rgba(${hexToRgb(accentColor)}, 0.65); }
      100% { box-shadow: 0 0 0 14px rgba(${hexToRgb(accentColor)}, 0); }
    }
    .user-row.is-receiving .user-avatar {
      animation: avatar-ping 700ms ease-out;
    }

    /* Score number briefly scales up + glows on increment. */
    @keyframes score-pop {
      0%   { transform: scale(1); text-shadow: 0 0 10px rgba(${hexToRgb(accentColor)}, 0.2); }
      40%  { transform: scale(1.25); text-shadow: 0 0 18px rgba(${hexToRgb(accentColor)}, 0.85); }
      100% { transform: scale(1); text-shadow: 0 0 10px rgba(${hexToRgb(accentColor)}, 0.2); }
    }
    .user-score.is-popping {
      display: inline-block;
      animation: score-pop 420ms ease-out;
    }

    .size-warning {
      position: fixed;
      inset: 0;
      border: 2px dashed rgba(255, 200, 0, 0.6);
      border-radius: 0;
      background: rgba(20, 16, 0, 0.88);
      color: #ffd166;
      font-family: var(--font-main);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 12px;
      z-index: 10001;
      gap: 6px;
    }
    .size-warning h1 { font-size: clamp(14px, 4vw, 20px); font-weight: 800; margin: 0; }
    .size-warning p { font-size: clamp(11px, 2.4vw, 14px); line-height: 1.45; max-width: 520px; margin: 0; }
    .size-warning code { background: rgba(0, 0, 0, 0.45); padding: 2px 6px; border-radius: 4px; font-size: 0.95em; }
    .size-warning .current { opacity: 0.6; font-size: clamp(10px, 2vw, 12px); }
  </style>
</head>
<body>
  <div class="leaderboard-wrapper ${showHeader ? '' : 'header-hidden'} ${showRankNumbers ? '' : 'no-ranks'}">
    <div class="header">
      <span id="header-title" class="header-title">${title}</span>
      <div class="header-total">
        <div id="status-dot" class="status-dot"></div>
        <span id="header-heart" class="header-heart" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M12 21s-7-4.5-9.5-9.5C.5 7.5 3 4 6.5 4 8.5 4 10.5 5 12 7c1.5-2 3.5-3 5.5-3 3.5 0 6 3.5 4 7.5C19 16.5 12 21 12 21z"/></svg>
        </span>
        <span id="total-likes">0</span>
      </div>
    </div>
    <div id="user-list" class="user-list">
      <div id="empty-state" class="empty-state">Waiting for likes</div>
      <!-- User rows will be position: absolute here -->
    </div>
  </div>

  <script>
    const ROW_HEIGHT = ${rowHeight};
    const MAX_VISIBLE = ${maxVisible};
    const BODY_PADDING = ${bodyPadding};
    const HEADER_HEIGHT = ${headerHeight};
    const WIDGET_SCALE = ${scale};
    const SOURCE_MIN_WIDTH = ${sourceMinWidth};
    const SOURCE_MIN_HEIGHT = ${sourceMinHeight};
    const CROWN_MARKUP = ${JSON.stringify(crownMarkup)};
    const IS_PREVIEW = ${JSON.stringify(isPreview)};
    const STREAM_TITLE = ${JSON.stringify(rawTitle)};
    const LIFETIME_TITLE = ${JSON.stringify(rawLifetimeTitle)};
    const LIFETIME_FALLBACK_ENABLED = true;
    const LIFETIME_CYCLE_ENABLED = ${JSON.stringify(lifetimeCycleEnabled)};
    const STREAM_WINDOW_MS = ${streamWindowMinutes} * 60 * 1000;
    const LIFETIME_WINDOW_MS = ${lifetimeWindowMinutes} * 60 * 1000;
    // In preview mode, compress the cycle so designers can see both phases
    // without waiting 5 real minutes. 12s stream + 6s lifetime.
    const PREVIEW_STREAM_WINDOW_MS = 12 * 1000;
    const PREVIEW_LIFETIME_WINDOW_MS = 6 * 1000;

    const HEART_PULSE_ENABLED = ${JSON.stringify(showPulsingHeart)};

    const userListEl = document.getElementById('user-list');
    const totalLikesEl = document.getElementById('total-likes');
    const headerTitleEl = document.getElementById('header-title');
    const headerHeartEl = document.getElementById('header-heart');
    let visibleLimit = MAX_VISIBLE;
    let offscreenY = ROW_HEIGHT * visibleLimit;

    function updateVisibleLimitFromViewport() {
      const availableHeight = Math.max(
        ROW_HEIGHT,
        ((window.innerHeight - (BODY_PADDING * 2)) / WIDGET_SCALE) - HEADER_HEIGHT
      );
      const nextLimit = Math.max(1, Math.min(MAX_VISIBLE, Math.floor(availableHeight / ROW_HEIGHT) || 1));
      visibleLimit = nextLimit;
      offscreenY = ROW_HEIGHT * visibleLimit;
      document.documentElement.style.setProperty('--visible-rows', String(visibleLimit));
      updateLeaderboard('');
    }

    // Rolling window of recent like timestamps. The header heart's pulse
    // duration shrinks as the like rate climbs — quiet feels calm (~1.4s),
    // a heavy stream feels frantic (~0.3s).
    const recentLikeTimes = [];
    const RATE_WINDOW_MS = 6000;
    const PULSE_MIN_DURATION_S = 0.3;
    const PULSE_MAX_DURATION_S = 1.4;
    let heartBurstResetTimer = null;

    function recordLikeForRate() {
      const now = performance.now();
      recentLikeTimes.push(now);
      while (recentLikeTimes.length && now - recentLikeTimes[0] > RATE_WINDOW_MS) {
        recentLikeTimes.shift();
      }
    }

    function updateHeartPulseRate() {
      if (!HEART_PULSE_ENABLED || !headerHeartEl) return;
      const ratePerSec = recentLikeTimes.length / (RATE_WINDOW_MS / 1000);
      // Linear ramp: 0 likes/sec -> max duration, 6+ likes/sec -> min duration.
      const t = Math.min(ratePerSec / 6, 1);
      const duration = PULSE_MAX_DURATION_S - (PULSE_MAX_DURATION_S - PULSE_MIN_DURATION_S) * t;
      headerHeartEl.style.setProperty('--heart-pulse-duration', duration + 's');
    }

    function burstHeaderHeart() {
      if (!HEART_PULSE_ENABLED || !headerHeartEl) return;
      // Re-trigger by removing + forcing reflow + re-adding so quick repeats
      // restart the burst instead of being ignored.
      headerHeartEl.classList.remove('is-bursting');
      void headerHeartEl.offsetHeight;
      headerHeartEl.classList.add('is-bursting');
      if (heartBurstResetTimer) clearTimeout(heartBurstResetTimer);
      heartBurstResetTimer = setTimeout(() => {
        headerHeartEl.classList.remove('is-bursting');
        heartBurstResetTimer = null;
      }, 400);
    }

    function pingRowAvatar(rowEl) {
      if (!HEART_PULSE_ENABLED || !rowEl) return;
      rowEl.classList.remove('is-receiving');
      void rowEl.offsetHeight;
      rowEl.classList.add('is-receiving');
      setTimeout(() => rowEl && rowEl.classList.remove('is-receiving'), 720);
    }

    function popRowScore(rowEl) {
      if (!HEART_PULSE_ENABLED || !rowEl) return;
      const scoreEl = rowEl.querySelector('.user-score');
      if (!scoreEl) return;
      scoreEl.classList.remove('is-popping');
      void scoreEl.offsetHeight;
      scoreEl.classList.add('is-popping');
      setTimeout(() => scoreEl && scoreEl.classList.remove('is-popping'), 440);
    }

    // Recompute pulse rate on a steady cadence so the pulse decays back to
    // calm even if no new likes come in (otherwise the rate would stay
    // "frozen" at whatever the last event left it at).
    setInterval(updateHeartPulseRate, 500);

    // 'stream' shows live current-session leaders; 'lifetime' shows the all-time
    // top likers fetched from the stats endpoint.
    let mode = 'stream';
    let lifetimeFallbackActive = false;
    let lifetimeFallbackRequestId = 0;
    let totalLikes = 0;
    // Keyed by the server's unique key (\`\${platform}:\${username}\`) so two users
    // sharing a display name don't collapse into one entry. Falls back to
    // displayName for legacy snapshots and preview/test mode.
    const users = new Map();
    // Stash the latest stream snapshot data so we can swap back to it when the
    // lifetime glimpse window ends without waiting for a fresh SSE message.
    let streamCache = { totalLikes: 0, users: [] };

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      ));
    }

    function safeAvatarUrl(url) {
      if (!url) return 'https://via.placeholder.com/36';
      // Allow http(s) and data: only — block javascript:, etc.
      if (/^(https?:|data:image\\/)/i.test(url)) return url;
      return 'https://via.placeholder.com/36';
    }

    function userKey(user) {
      return String(user && (user.key || user.displayName) || '');
    }

    function addLike(payload) {
      if (!payload) return;
      const { displayName, profilePictureUrl, amount } = payload;

      // Skip events without an identifiable user — otherwise we'd key the Map by undefined.
      if (!displayName) return;

      const key = userKey(payload);
      const likeAmount = Math.max(1, Math.floor(Number(amount)) || 1);

      // Drive the pulsing-heart cadence + one-shot burst from every like
      // event, regardless of mode — the header heart should keep pulsing
      // even while the lifetime glimpse is on screen.
      recordLikeForRate();
      updateHeartPulseRate();
      burstHeaderHeart();

      // The server now applies all source-of-truth logic for the global total
      // (prefer platform cumulative, fall back to delta accumulation, ignore
      // regressions). The overlay just trusts payload.totalLikes if present
      // and never lets the on-screen counter go backward.
      const incoming = Number(payload.totalLikes);
      if (Number.isFinite(incoming) && incoming > streamCache.totalLikes) {
        streamCache.totalLikes = incoming;
      } else if (!Number.isFinite(incoming) || incoming <= 0) {
        // Server didn't supply a total — increment the stream cache as a fallback.
        streamCache.totalLikes += likeAmount;
      }

      // Always update the stream cache so we have fresh data to swap back to.
      const cacheEntry = streamCache.users.find((u) => u.key === key);
      if (cacheEntry) {
        cacheEntry.count += likeAmount;
        cacheEntry.displayName = displayName || cacheEntry.displayName;
        if (profilePictureUrl) cacheEntry.profilePictureUrl = profilePictureUrl;
      } else {
        streamCache.users.push({ key, displayName, profilePictureUrl, count: likeAmount });
      }

      if (lifetimeFallbackActive) {
        lifetimeFallbackActive = false;
        if (headerTitleEl) headerTitleEl.textContent = STREAM_TITLE;
        renderUsersFromList(streamCache.users, streamCache.totalLikes);
        const activeUser = users.get(key);
        const activeRow = activeUser ? activeUser.element : null;
        if (activeRow) {
          pingRowAvatar(activeRow);
          popRowScore(activeRow);
        }
        return;
      }

      // Only paint into the live DOM if we're currently in stream mode —
      // during the lifetime glimpse we mustn't disturb the all-time view.
      if (mode !== 'stream') return;

      if (Number.isFinite(incoming) && incoming > totalLikes) {
        totalLikes = incoming;
      } else if (!Number.isFinite(incoming) || incoming <= 0) {
        totalLikes += likeAmount;
      }
      totalLikesEl.textContent = totalLikes.toLocaleString();

      // Per-user count always increments by the per-event delta — the platform
      // total only describes the aggregate, not the per-user attribution.
      let userData = users.get(key);
      if (!userData) {
        userData = { displayName, profilePictureUrl, count: 0, element: null };
        users.set(key, userData);
      }
      userData.count += likeAmount;
      userData.displayName = displayName || userData.displayName;
      if (profilePictureUrl) userData.profilePictureUrl = profilePictureUrl;

      updateLeaderboard(key);

      // Once the leaderboard has settled, ping the active row's avatar and
      // pop the score number for whoever just received the like.
      const activeUser = users.get(key);
      const activeRow = activeUser ? activeUser.element : null;
      if (activeRow) {
        pingRowAvatar(activeRow);
        popRowScore(activeRow);
      }
    }

    function applySnapshot(payload) {
      if (!payload) return;

      // Capture the previous totals so we can detect "a like just landed" from
      // a snapshot delta. The server only ever broadcasts snapshots (never
      // 'append'), so without this diff the pulse-heart / avatar-ping /
      // score-pop animations the audit added would never fire in live mode.
      const prevTotalLikes = streamCache.totalLikes;
      const prevUserCounts = new Map(streamCache.users.map((u) => [u.key, u.count]));

      // Always cache the latest stream snapshot, even while the lifetime view
      // is on screen, so we have fresh data to render when we swap back.
      if (Number.isFinite(Number(payload.totalLikes))) {
        streamCache.totalLikes = Math.max(0, Math.floor(Number(payload.totalLikes)));
      }
      if (Array.isArray(payload.users)) {
        streamCache.users = payload.users
          .filter((u) => u && u.displayName)
          .map((u) => ({
            key: userKey(u),
            displayName: u.displayName,
            profilePictureUrl: u.profilePictureUrl,
            count: Math.max(0, Math.floor(Number(u.count)) || 0)
          }));
      }

      const totalDelta = streamCache.totalLikes - prevTotalLikes;
      // Fire the header heart + rate tracker on any positive delta. The
      // rate tracker drives the steady pulse cadence; the burst is the
      // per-like one-shot.
      if (mode === 'stream' && totalDelta > 0) {
        recordLikeForRate();
        updateHeartPulseRate();
        burstHeaderHeart();
      }

      const streamHasUsers = streamCache.users.length > 0;
      if (lifetimeFallbackActive && streamHasUsers) {
        lifetimeFallbackActive = false;
        if (headerTitleEl) headerTitleEl.textContent = STREAM_TITLE;
      }

      if (mode !== 'stream') return;

      if (!streamHasUsers) {
        if (!lifetimeFallbackActive) {
          renderUsersFromList([], streamCache.totalLikes);
          void maybeShowLifetimeFallback();
        }
        return;
      }

      renderUsersFromList(streamCache.users, streamCache.totalLikes);

      // After the render commits the rows, ping the avatar and pop the
      // score for each user whose count went up. Skip rows we don't have
      // an element for (off the top-N list).
      if (totalDelta > 0) {
        streamCache.users.forEach((u) => {
          const prev = prevUserCounts.get(u.key) || 0;
          if (u.count <= prev) return;
          const user = users.get(u.key);
          const row = user ? user.element : null;
          if (row) {
            pingRowAvatar(row);
            popRowScore(row);
          }
        });
      }
    }

    // Replace the on-screen leaderboard wholesale from an arbitrary user list.
    // Used by both the stream snapshot and the lifetime fetch — keeping a
    // single render path means the swap animation is consistent either way.
    function renderUsersFromList(list, total) {
      if (Number.isFinite(Number(total))) {
        totalLikes = Math.max(0, Math.floor(Number(total)));
        totalLikesEl.textContent = totalLikes.toLocaleString();
      }

      const next = new Map();
      list.forEach((user) => {
        if (!user || !user.displayName) return;
        const key = user.key || userKey(user);
        const previous = users.get(key);
        next.set(key, {
          displayName: user.displayName,
          profilePictureUrl: user.profilePictureUrl,
          count: Math.max(0, Math.floor(Number(user.count)) || 0),
          element: previous ? previous.element : null
        });
      });

      users.forEach((data, key) => {
        if (!next.has(key) && data.element) {
          const removing = data.element;
          data.element = null;
          removing.style.opacity = '0';
          removing.style.transform = 'translateY(' + offscreenY + 'px)';
          setTimeout(() => removing.remove(), 600);
        }
      });

      users.clear();
      next.forEach((value, key) => users.set(key, value));

      updateLeaderboard('');
    }

    function requestJson(url) {
      if (typeof fetch === 'function') {
        return fetch(url, { cache: 'no-store' }).then((res) => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        });
      }

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        try {
          xhr.setRequestHeader('Cache-Control', 'no-cache');
        } catch (err) {
          // Some embedded browser sources reject custom cache headers. The
          // timestamp query below still gives us a fresh response.
        }
        xhr.onreadystatechange = () => {
          if (xhr.readyState !== 4) return;
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error('HTTP ' + xhr.status));
            return;
          }
          try {
            resolve(JSON.parse(xhr.responseText || 'null'));
          } catch (err) {
            reject(err);
          }
        };
        xhr.onerror = () => reject(new Error('network error'));
        xhr.send();
      });
    }

    async function fetchLifetimeSnapshot() {
      try {
        return await requestJson(new URL('/overlay/likes/lifetime?limit=' + MAX_VISIBLE + '&t=' + Date.now(), window.location.href).href);
      } catch (err) {
        console.error('[likes] lifetime fetch failed:', err);
        return null;
      }
    }

    async function maybeShowLifetimeFallback() {
      if (!LIFETIME_FALLBACK_ENABLED || lifetimeFallbackActive || mode !== 'stream' || streamCache.users.length > 0) return;

      const requestId = ++lifetimeFallbackRequestId;
      const snapshot = await fetchLifetimeSnapshot();
      if (requestId !== lifetimeFallbackRequestId) return;
      if (mode !== 'stream' || streamCache.users.length > 0) return;
      if (!snapshot || !Array.isArray(snapshot.users) || snapshot.users.length === 0) return;

      lifetimeFallbackActive = true;
      if (headerTitleEl) headerTitleEl.textContent = LIFETIME_TITLE;
      renderUsersFromList(snapshot.users, snapshot.totalLikes);
    }

    async function enterLifetimeMode() {
      if (mode === 'lifetime') return;
      const snapshot = await fetchLifetimeSnapshot();
      if (!snapshot || !Array.isArray(snapshot.users) || snapshot.users.length === 0) {
        // Nothing to show — stay in stream mode for this cycle.
        return;
      }
      lifetimeFallbackActive = false;
      mode = 'lifetime';
      if (headerTitleEl) headerTitleEl.textContent = LIFETIME_TITLE;
      renderUsersFromList(snapshot.users, snapshot.totalLikes);
    }

    function exitLifetimeMode() {
      if (mode !== 'lifetime') return;
      mode = 'stream';
      if (headerTitleEl) headerTitleEl.textContent = STREAM_TITLE;
      renderUsersFromList(streamCache.users, streamCache.totalLikes);
      if (streamCache.users.length === 0) void maybeShowLifetimeFallback();
    }

    function startCycle() {
      if (!LIFETIME_CYCLE_ENABLED) return;
      const streamWindow = IS_PREVIEW ? PREVIEW_STREAM_WINDOW_MS : STREAM_WINDOW_MS;
      const lifetimeWindow = IS_PREVIEW ? PREVIEW_LIFETIME_WINDOW_MS : LIFETIME_WINDOW_MS;
      const scheduleNext = () => {
        setTimeout(async () => {
          await enterLifetimeMode();
          setTimeout(() => {
            exitLifetimeMode();
            scheduleNext();
          }, lifetimeWindow);
        }, streamWindow);
      };
      scheduleNext();
    }

    // TEST MODE: Press 'T' to simulate a like
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 't') {
        console.log('[test] Simulating like...');
        addLike({
          displayName: 'Test User ' + Math.floor(Math.random() * 5),
          profilePictureUrl: 'https://via.placeholder.com/36',
          amount: 50,
          totalLikes: totalLikes + 50
        });
      }
    });

    function updateLeaderboard(activeKey) {
      const sorted = Array.from(users.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, visibleLimit);

      const currentTopKeys = new Set(sorted.map(([key]) => key));
      userListEl.classList.toggle('has-users', sorted.length > 0);

      sorted.forEach(([key, data], index) => {
        let row = data.element;
        const displayName = data.displayName || key;

        if (!row) {
          row = document.createElement('div');
          row.className = 'user-row';
          // Start off-screen below the list so the row visibly slides up into place.
          row.style.opacity = '0';
          row.style.transform = 'translateY(' + offscreenY + 'px)';
          row.innerHTML =
            '<div class="rank">#' + (index + 1) + '</div>' +
            '<div class="avatar-wrapper">' +
              '<img class="user-avatar" src="' + escapeHtml(safeAvatarUrl(data.profilePictureUrl)) + '" />' +
              CROWN_MARKUP +
            '</div>' +
            '<div class="user-info">' +
              '<span class="user-name">' + escapeHtml(displayName) + '</span>' +
            '</div>' +
            '<div class="user-score">' + data.count.toLocaleString() + '</div>';

          userListEl.appendChild(row);
          data.element = row;

          // Force the browser to commit the initial off-screen state before we
          // change to the final state — without this reflow, the two style
          // changes are batched and no transition runs.
          void row.offsetHeight;
        }

        row.className = 'user-row rank-' + (index + 1);
        row.querySelector('.rank').textContent = '#' + (index + 1);
        row.querySelector('.user-score').textContent = data.count.toLocaleString();

        const nameEl = row.querySelector('.user-name');
        if (nameEl && nameEl.textContent !== displayName) {
          nameEl.textContent = displayName;
        }

        // Keep avatar in sync if the user supplied a new profile picture.
        const avatarEl = row.querySelector('.user-avatar');
        const desiredSrc = safeAvatarUrl(data.profilePictureUrl);
        if (avatarEl && avatarEl.getAttribute('src') !== desiredSrc) {
          avatarEl.setAttribute('src', desiredSrc);
        }

        // Always reset opacity/position — handles re-entry of users that were
        // previously faded out of the visible set.
        row.style.opacity = '1';
        row.style.transform = 'translateY(' + (index * ROW_HEIGHT) + 'px)';
        row.style.zIndex = String(visibleLimit - index);

        if (key === activeKey) {
          spawnParticles(row);
        }
      });

      // Fade out users who fell out of the visible set. Detach the element from the
      // user record immediately so a quick re-entry creates a fresh row
      // instead of racing with the pending removal.
      users.forEach((data, key) => {
        if (!currentTopKeys.has(key) && data.element) {
          const removing = data.element;
          data.element = null;
          removing.style.opacity = '0';
          removing.style.transform = 'translateY(' + offscreenY + 'px)';
          setTimeout(() => removing.remove(), 600);
        }
      });
    }

    function spawnParticles(el) {
      const rect = el.getBoundingClientRect();
      for (let i = 0; i < 2; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.textContent = '❤️';
        p.style.left = (rect.right - 40) + 'px';
        p.style.top = (rect.top + 20) + 'px';
        p.style.setProperty('--dx', (Math.random() * 40 + 20) + 'px');
        p.style.setProperty('--dy', (Math.random() * -60 - 20) + 'px');
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1200);
      }
    }

    const statusDot = document.getElementById('status-dot');
    let fallbackPollingTimer = null;

    async function hydrateLikesState() {
      try {
        applySnapshot(await requestJson(new URL('/overlay/likes/state?t=' + Date.now(), window.location.href).href));
        statusDot.className = 'status-dot connected';
      } catch (err) {
        console.error('[likes] state hydrate failed:', err);
      }
    }

    function startFallbackPolling() {
      if (fallbackPollingTimer) return;
      hydrateLikesState();
      fallbackPollingTimer = setInterval(hydrateLikesState, 2000);
    }

    function stopFallbackPolling() {
      if (!fallbackPollingTimer) return;
      clearInterval(fallbackPollingTimer);
      fallbackPollingTimer = null;
    }

    function checkViewportSize() {
      if (IS_PREVIEW) return;
      const existing = document.getElementById('likes-size-warning');
      if (existing) existing.remove();
      const tooSmall = window.innerWidth < SOURCE_MIN_WIDTH || window.innerHeight < SOURCE_MIN_HEIGHT;
      if (!tooSmall) return;
      console.warn('[likes] Browser source is smaller than the recommended ' + SOURCE_MIN_WIDTH + 'x' + SOURCE_MIN_HEIGHT + '; rendering compact instead of blocking the widget.');
    }

    function handleViewportChange() {
      updateVisibleLimitFromViewport();
      checkViewportSize();
    }

    function connectLikesStream() {
      if (typeof EventSource !== 'function') {
        console.warn('[likes] EventSource not supported, using polling fallback.');
        statusDot.className = 'status-dot error';
        startFallbackPolling();
        return;
      }

      let eventSource = null;
      try {
        eventSource = new EventSource(new URL('/overlay/events?channel=likes', window.location.href).href);
      } catch (err) {
        console.error('[likes] SSE setup failed:', err);
        statusDot.className = 'status-dot error';
        startFallbackPolling();
        return;
      }

      eventSource.onopen = () => {
        console.log('[likes] SSE Connected');
        statusDot.className = 'status-dot connected';
        stopFallbackPolling();
      };

      eventSource.onerror = (err) => {
        console.error('[likes] SSE Error:', err);
        statusDot.className = 'status-dot error';
        startFallbackPolling();
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[likes] Received data:', data.type);
          if (data.type === 'snapshot') {
            applySnapshot(data.payload);
          } else if (data.type === 'append') {
            addLike(data.payload);
          }
        } catch (e) {
          console.error('[likes] Failed to parse event:', e);
        }
      };
    }

    window.addEventListener('load', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    handleViewportChange();

    if (IS_PREVIEW) {
      statusDot.className = 'status-dot connected';
      const previewUsers = [
        ['MiaMoon', 430],
        ['PixelDrew', 270],
        ['RoseRush', 155],
        ['NeonFriend', 90]
      ];
      previewUsers.forEach(([displayName, amount], index) => {
        setTimeout(() => addLike({
          displayName,
          profilePictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(displayName),
          amount,
          totalLikes: totalLikes + amount
        }), index * 250);
      });
      setInterval(() => {
        const user = previewUsers[Math.floor(Math.random() * previewUsers.length)][0];
        const amount = Math.floor(Math.random() * 45) + 5;
        addLike({
          displayName: user,
          profilePictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(user),
          amount
        });
      }, 1800);
    } else {
      hydrateLikesState();
      connectLikesStream();
    }

    startCycle();
  </script>
</body>
</html>`;
}
