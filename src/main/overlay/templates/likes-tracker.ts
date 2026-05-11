import {
  DEFAULT_LIKES_TRACKER_CONFIG,
  type LikesTrackerConfig,
  type Widget
} from '../../../shared/widgets'

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return Math.min(max, Math.max(min, numericValue))
}

function safeHexColor(value: unknown, fallback: string): string {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
}

export function buildLikesTrackerHtml(widget: Widget, isPreview: boolean = false): string {
  const config: LikesTrackerConfig = {
    ...DEFAULT_LIKES_TRACKER_CONFIG,
    ...(widget.config as Partial<LikesTrackerConfig> | undefined)
  }
  const maxVisible = Math.round(clampNumber(config.maxAvatars, 1, 25, DEFAULT_LIKES_TRACKER_CONFIG.maxAvatars))
  const accentColor = safeHexColor(config.accentColor, DEFAULT_LIKES_TRACKER_CONFIG.accentColor)
  const opacity = clampNumber(config.opacity, 0.1, 1, DEFAULT_LIKES_TRACKER_CONFIG.opacity)
  const scale = clampNumber(config.scale, 0.5, 2, DEFAULT_LIKES_TRACKER_CONFIG.scale)
  const showTotal = config.showTotal !== false
  
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
      --text-color: #ffffff;
      --glass-bg: rgba(15, 15, 20, 0.7);
      --glass-border: rgba(255, 255, 255, 0.1);
      --row-height: 60px;
      --accent-color: ${accentColor};
      --accent-gradient: linear-gradient(135deg, var(--accent-color), #25f4ee);
      --gold: #ffd700;
      --silver: #e0e0e0;
      --bronze: #cd7f32;
    }

    body {
      margin: 0;
      padding: 15px;
      overflow: hidden;
      background: var(--bg-color);
      font-family: 'Outfit', sans-serif;
      color: var(--text-color);
      -webkit-font-smoothing: antialiased;
      opacity: ${opacity};
    }

    .leaderboard-wrapper {
      width: 320px;
      display: flex;
      flex-direction: column;
      filter: drop-shadow(0 10px 30px rgba(0,0,0,0.5));
      transform: scale(${scale});
      transform-origin: top left;
    }

    .header {
      padding: 15px 20px;
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border-radius: 16px 16px 0 0;
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
      letter-spacing: 1.5px;
      background: linear-gradient(to right, #fff, rgba(255,255,255,0.6));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
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

    .user-list {
      position: relative;
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      border-radius: 0 0 16px 16px;
      border: 1px solid var(--glass-border);
      border-top: none;
      min-height: calc(var(--row-height) * ${maxVisible});
      overflow: hidden;
    }

    .user-row {
      position: absolute;
      left: 0;
      right: 0;
      height: var(--row-height);
      display: flex;
      align-items: center;
      padding: 0 20px;
      box-sizing: border-box;
      transition: all 0.7s cubic-bezier(0.22, 1, 0.36, 1);
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }

    .rank {
      width: 28px;
      font-size: 16px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.3);
      font-family: 'Outfit', sans-serif;
    }

    .rank-1 .rank { color: var(--gold); font-size: 20px; }
    .rank-2 .rank { color: var(--silver); }
    .rank-3 .rank { color: var(--bronze); }

    .avatar-wrapper {
      position: relative;
      margin: 0 15px;
    }

    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      display: block;
      object-fit: cover;
      transition: all 0.3s ease;
    }

    .rank-1 .user-avatar { 
      border-color: var(--gold);
      box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
      transform: scale(1.1);
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
      color: rgba(255, 255, 255, 0.9);
    }

    .user-score {
      font-size: 16px;
      font-weight: 800;
      color: var(--accent-color);
      text-align: right;
      padding-left: 10px;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 0 10px rgba(254, 44, 85, 0.2);
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
  </style>
</head>
<body>
  <div class="leaderboard-wrapper">
    <div class="header">
      <span class="header-title">Top Likers</span>
      <div class="header-total">
        <div id="status-dot" class="status-dot"></div>
        <span id="total-likes">0</span>
      </div>
    </div>
    <div id="user-list" class="user-list">
      <!-- User rows will be position: absolute here -->
    </div>
  </div>

  <script>
    const ROW_HEIGHT = 60;
    const MAX_VISIBLE = ${maxVisible};
    const OFFSCREEN_Y = ROW_HEIGHT * MAX_VISIBLE;

    const userListEl = document.getElementById('user-list');
    const totalLikesEl = document.getElementById('total-likes');

    let totalLikes = 0;
    const users = new Map(); // key: displayName, value: { profilePictureUrl, count, element }

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

    function addLike(payload) {
      if (!payload) return;
      const { displayName, profilePictureUrl, amount } = payload;

      // Skip events without an identifiable user — otherwise we'd key the Map by undefined.
      if (!displayName) return;

      const likeAmount = Math.max(1, Math.floor(Number(amount)) || 1);

      // The server now applies all source-of-truth logic for the global total
      // (prefer platform cumulative, fall back to delta accumulation, ignore
      // regressions). The overlay just trusts payload.totalLikes if present
      // and never lets the on-screen counter go backward.
      const incoming = Number(payload.totalLikes);
      if (Number.isFinite(incoming) && incoming > totalLikes) {
        totalLikes = incoming;
      } else if (!Number.isFinite(incoming) || incoming <= 0) {
        // Server didn't supply a total — increment locally as a fallback.
        totalLikes += likeAmount;
      }
      totalLikesEl.textContent = totalLikes.toLocaleString();

      // Per-user count always increments by the per-event delta — the platform
      // total only describes the aggregate, not the per-user attribution.
      let userData = users.get(displayName);
      if (!userData) {
        userData = { profilePictureUrl, count: 0, element: null };
        users.set(displayName, userData);
      }
      userData.count += likeAmount;
      if (profilePictureUrl) userData.profilePictureUrl = profilePictureUrl;

      updateLeaderboard(displayName);
    }

    function applySnapshot(payload) {
      if (!payload) return;
      if (Number.isFinite(Number(payload.totalLikes))) {
        totalLikes = Math.max(totalLikes, Number(payload.totalLikes));
        totalLikesEl.textContent = totalLikes.toLocaleString();
      }

      if (Array.isArray(payload.users)) {
        payload.users.forEach((user) => {
          if (!user || !user.displayName) return;
          users.set(user.displayName, {
            profilePictureUrl: user.profilePictureUrl,
            count: Math.max(0, Math.floor(Number(user.count)) || 0),
            element: users.get(user.displayName)?.element || null
          });
        });
        updateLeaderboard('');
      }
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

    function updateLeaderboard(activeUser) {
      const sorted = Array.from(users.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, MAX_VISIBLE);

      const currentTopNames = new Set(sorted.map(([name]) => name));

      sorted.forEach(([name, data], index) => {
        let row = data.element;

        if (!row) {
          row = document.createElement('div');
          row.className = 'user-row';
          // Start off-screen below the list so the row visibly slides up into place.
          row.style.opacity = '0';
          row.style.transform = 'translateY(' + OFFSCREEN_Y + 'px)';
          row.innerHTML =
            '<div class="rank">#' + (index + 1) + '</div>' +
            '<div class="avatar-wrapper">' +
              '<img class="user-avatar" src="' + escapeHtml(safeAvatarUrl(data.profilePictureUrl)) + '" />' +
            '</div>' +
            '<div class="user-info">' +
              '<span class="user-name">' + escapeHtml(name) + '</span>' +
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

        // Keep avatar in sync if the user supplied a new profile picture.
        const avatarEl = row.querySelector('.user-avatar');
        const desiredSrc = safeAvatarUrl(data.profilePictureUrl);
        if (avatarEl && avatarEl.getAttribute('src') !== desiredSrc) {
          avatarEl.setAttribute('src', desiredSrc);
        }

        // Always reset opacity/position — handles re-entry of users that were
        // previously faded out of the top 10.
        row.style.opacity = '1';
        row.style.transform = 'translateY(' + (index * ROW_HEIGHT) + 'px)';
        row.style.zIndex = String(MAX_VISIBLE - index);

        if (name === activeUser) {
          spawnParticles(row);
        }
      });

      // Fade out users who fell out of top 10. Detach the element from the
      // user record immediately so a quick re-entry creates a fresh row
      // instead of racing with the pending removal.
      users.forEach((data, name) => {
        if (!currentTopNames.has(name) && data.element) {
          const removing = data.element;
          data.element = null;
          removing.style.opacity = '0';
          removing.style.transform = 'translateY(' + OFFSCREEN_Y + 'px)';
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

    // Connect to SSE
    const statusDot = document.getElementById('status-dot');
    const eventSource = new EventSource(window.location.origin + '/overlay/events?channel=likes');
    
    eventSource.onopen = () => {
      console.log('[likes] SSE Connected');
      statusDot.className = 'status-dot connected';
    };

    eventSource.onerror = (err) => {
      console.error('[likes] SSE Error:', err);
      statusDot.className = 'status-dot error';
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

    if (${isPreview}) {
      const previewUsers = [
        ['restless tiny spirit', 430],
        ['chat menace', 270],
        ['rose rush', 155],
        ['neon friend', 90]
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
    }
  </script>
</body>
</html>`;
}
