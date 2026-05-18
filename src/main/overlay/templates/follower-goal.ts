import { FollowerGoalConfig, DEFAULT_FOLLOWER_GOAL_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = (hex || '').replace('#', '').trim()
  if (cleaned.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return { r: 100, g: 100, b: 100 }
  }
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16)
  }
}

export function buildFollowerGoalHtml(widget?: any, isPreview = false): string {
  const cfg: FollowerGoalConfig = { ...DEFAULT_FOLLOWER_GOAL_CONFIG, ...(widget?.config || {}) }
  const bgOpacity = isPreview ? 0 : cfg.backgroundOpacity

  const positionMap: Record<string, string> = {
    'top-left':      'align-items:flex-start;justify-content:flex-start',
    'top-center':    'align-items:flex-start;justify-content:center',
    'top-right':     'align-items:flex-start;justify-content:flex-end',
    'bottom-left':   'align-items:flex-end;justify-content:flex-start',
    'bottom-center': 'align-items:flex-end;justify-content:center',
    'bottom-right':  'align-items:flex-end;justify-content:flex-end',
  }
  const shellStyle = positionMap[cfg.position] ?? positionMap['top-right']

  const accentRgb = hexToRgb(cfg.accentColor)
  const configJson = JSON.stringify(cfg)

  return `<!doctype html>
<html lang="en" style="background: transparent !important; background-color: transparent !important;">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ilyStream Follower Goal</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: dark;
        --font-heading: "Outfit", system-ui, sans-serif;
        --blur: ${cfg.blur}px;
        --bg: rgba(4, 5, 8, ${bgOpacity});
        --accent: ${cfg.accentColor};
        --accent-rgb: ${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b};
        --width: ${cfg.width}px;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: transparent !important;
        background-color: transparent !important;
        color: #fff;
        min-height: 100vh;
        overflow: hidden;
        font-family: var(--font-heading);
      }
      .shell {
        min-height: 100vh;
        display: flex;
        padding: 40px;
        ${shellStyle};
      }
      .card {
        width: auto;
        min-width: var(--width);
        max-width: calc(100vw - 80px);
        border-radius: 999px;
        padding: 12px 32px;
        background: rgba(10, 12, 18, 0.45);
        backdrop-filter: blur(40px) saturate(250%);
        -webkit-backdrop-filter: blur(40px) saturate(250%);
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow:
            0 25px 60px rgba(0,0,0,0.5),
            inset 0 0 20px rgba(255,255,255,0.05);
        animation: card-appear 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
        position: relative;
        display: flex;
        align-items: center;
        gap: 24px;
      }

      ${getAnimationCss({
        style: (cfg as any).animationStyle || 'slide',
        duration: (cfg as any).animationDuration || 800
      }, '.card')}

      .card::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%);
        pointer-events: none;
      }
      .info-group {
        display: flex;
        align-items: center;
        gap: 18px;
        flex-shrink: 0;
      }
      .lbl {
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #FFFFFF;
        opacity: 0.6;
        white-space: nowrap;
      }
      .counts {
        display: flex;
        align-items: center;
        gap: 20px;
        white-space: nowrap;
      }
      .current {
        font-size: 26px;
        font-weight: 900;
        color: #FFFFFF;
        line-height: 1;
        letter-spacing: 0.02em;
      }
      .goal-text {
        font-size: 14px;
        font-weight: 700;
        color: #FFFFFF;
        opacity: 0.4;
      }
      .progress-area {
        flex: 1;
        min-width: 100px;
      }
      .track {
        height: 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.1);
        overflow: hidden;
        position: relative;
      }
      .fill {
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
        width: 0%;
        transition: width 1.5s cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
      }
      .pct-badge {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 6px 18px;
        min-width: 75px;
        text-align: center;
        border-radius: 999px;
        font-weight: 900;
        font-size: 14px;
        letter-spacing: 0.05em;
        backdrop-filter: blur(10px);
        flex-shrink: 0;
        margin-left: 4px;
      }

      /* Chroma Mode */
      .chroma-text {
        background: linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #0000ff, #ff0000);
        background-size: 200% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: chroma-flow 8s linear infinite;
      }
      .chroma-bg {
        background: linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #0000ff, #ff0000) !important;
        background-size: 400px 100% !important;
        animation: chroma-flow-fixed 8s linear infinite !important;
      }

      /* Cyberneon Mode */
      .cyberneon-text {
        background: linear-gradient(90deg, #D035F1, #19C8FF, #D035F1, #19C8FF, #D035F1);
        background-size: 200% auto;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: chroma-flow 6s linear infinite;
      }
      .cyberneon-bg {
        background: linear-gradient(90deg, #D035F1, #19C8FF, #D035F1, #19C8FF, #D035F1) !important;
        background-size: 400px 100% !important;
        animation: chroma-flow-fixed 6s linear infinite !important;
      }

      /* Advanced Border Gradient */
      .card.has-gradient-border {
        border: none;
      }
      .card.has-gradient-border::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 2px;
        background: var(--gradient-border);
        background-size: 200% 100%;
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
        animation: border-flow 12s linear infinite;
      }
      .card.chroma-border {
        --gradient-border: linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #0000ff, #ff0000);
      }
      .card.cyberneon-border {
        --gradient-border: linear-gradient(90deg, #D035F1, #19C8FF, #D035F1, #19C8FF, #D035F1);
      }
      @keyframes border-flow {
        0% { background-position: 0% 0%; }
        100% { background-position: -100% 0%; }
      }

      /* Celebration Effects */
      .celebrate {
        animation: celebrate-burst 0.6s cubic-bezier(0.17, 0.89, 0.32, 1.49) !important;
      }
      @keyframes celebrate-burst {
        0% { transform: scale(1); }
        50% { transform: scale(1.15); box-shadow: 0 0 100px var(--accent); }
        100% { transform: scale(1); }
      }
      .confetti {
        position: absolute;
        width: 10px;
        height: 10px;
        background: var(--accent);
        top: 50%;
        left: 50%;
        opacity: 0;
        pointer-events: none;
        border-radius: 2px;
      }
      @keyframes confetti-fall {
        0% { transform: translate(-50%, -50%) rotate(0deg); opacity: 1; }
        100% { transform: translate(var(--tx), var(--ty)) rotate(var(--tr)); opacity: 0; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="card" id="card">
        <div class="info-group">
          <div class="lbl" id="lbl-text"></div>
          <div class="counts">
            <div class="current" id="current">0</div>
            <div class="goal-text" id="goal-text"></div>
          </div>
        </div>
        <div class="progress-area">
          <div class="track">
            <div class="fill" id="fill"></div>
          </div>
        </div>
        <div class="pct-badge" id="pct-badge"><span id="pct">0%</span></div>
      </div>
    </div>

    <script>
      var CFG = ${configJson};
      var params = new URLSearchParams(window.location.search);

      var IS_CHROMA = params.get('chroma') === '1' || params.get('chroma') === 'true' || CFG.accentColor === 'chroma' || CFG.style === 'chroma';
      var IS_CYBERNEON = params.get('cyberneon') === '1' || params.get('cyberneon') === 'true' || CFG.accentColor === 'cyberneon' || CFG.style === 'cyber';
      var OFFSET = parseInt(params.get('offset') || '0', 10);
      var GOAL_OVERRIDE = params.get('goal') ? parseInt(params.get('goal'), 10) : null;

      if (GOAL_OVERRIDE) CFG.goal = GOAL_OVERRIDE;
      if (params.get('label')) CFG.label = params.get('label');

      var elCard = document.getElementById('card');
      var elLbl = document.getElementById('lbl-text');
      var elCurrent = document.getElementById('current');
      var elGoalText = document.getElementById('goal-text');
      var elFill = document.getElementById('fill');
      var elPct = document.getElementById('pct');
      var elPctBadge = document.getElementById('pct-badge');

      var displayedCount = 0;
      var countAnimFrame = null;

      elLbl.textContent = CFG.label;

      if (IS_CHROMA) {
        elCurrent.classList.add('chroma-text');
        elFill.classList.add('chroma-bg');
        elPct.classList.add('chroma-text');
        if (CFG.showBorder) elCard.classList.add('has-gradient-border', 'chroma-border');
      } else if (IS_CYBERNEON) {
        elCurrent.classList.add('cyberneon-text');
        elFill.classList.add('cyberneon-bg');
        elPct.classList.add('cyberneon-text');
        if (CFG.showBorder) elCard.classList.add('has-gradient-border', 'cyberneon-border');
      }

      function animateCount(target) {
        if (countAnimFrame) cancelAnimationFrame(countAnimFrame);
        const start = displayedCount;
        const duration = 1800;
        const startTime = performance.now();

        function step(now) {
          const progress = Math.min(1, (now - startTime) / duration);
          const ease = 1 - Math.pow(1 - progress, 5);
          displayedCount = Math.floor(start + (target - start) * ease);
          if (CFG.showCount) elCurrent.textContent = displayedCount.toLocaleString();
          if (progress < 1) countAnimFrame = requestAnimationFrame(step);
          else {
            displayedCount = target;
            if (CFG.showCount) elCurrent.textContent = target.toLocaleString();
          }
        }
        countAnimFrame = requestAnimationFrame(step);
      }

      function update(count) {
        var total = count + OFFSET;
        var goal = CFG.goal;
        var pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

        animateCount(total);
        elGoalText.textContent = goal > 0 ? '/ ' + goal.toLocaleString() : '';
        elFill.style.width = pct.toFixed(2) + '%';

        if (CFG.showPercentage) {
          elPct.textContent = Math.round(pct) + '%';
          elPctBadge.style.display = 'block';
        } else {
          elPctBadge.style.display = 'none';
        }

        if (CFG.celebrateAt100 !== false && pct >= 100 && !elCard.classList.contains('goal-reached')) {
          elCard.classList.add('goal-reached');
          triggerCelebration();
        } else if (pct < 100) {
          elCard.classList.remove('goal-reached');
        }
      }

      function triggerCelebration() {
        elCard.classList.add('celebrate');
        setTimeout(() => elCard.classList.remove('celebrate'), 1000);

        var type = CFG.celebrationType || 'confetti';
        var count = type === 'confetti' ? 35 : type === 'fireworks' ? 12 : 25;

        for (let i = 0; i < count; i++) {
          const c = document.createElement('div');
          c.className = 'confetti';

          if (type === 'hearts') {
            c.innerHTML = '<svg viewBox="0 0 32 32" width="100%" height="100%"><path fill="currentColor" d="M16 28.5L14.1 26.8C7.33 20.62 3 16.67 3 11.85C3 7.89 6.11 4.78 10.05 4.78C12.28 4.78 14.42 5.81 15.85 7.42C17.28 5.81 19.42 4.78 21.65 4.78C25.59 4.78 28.7 7.89 28.7 11.85C28.7 16.67 24.37 20.62 17.6 26.82L16 28.5Z"/></svg>';
            c.style.background = 'transparent';
            c.style.color = IS_CHROMA ? 'hsl(' + (Math.random() * 360) + ', 80%, 60%)' : 'var(--accent)';
            c.style.width = (15 + Math.random() * 15) + 'px';
            c.style.height = c.style.width;
          } else if (type === 'fireworks') {
            c.style.width = '4px';
            c.style.height = '4px';
            c.style.borderRadius = '50%';
            c.style.boxShadow = '0 0 10px 2px var(--accent)';
          }

          const angle = Math.random() * Math.PI * 2;
          const dist = type === 'fireworks' ? (150 + Math.random() * 300) : (100 + Math.random() * 200);

          c.style.setProperty('--tx', (Math.cos(angle) * dist) + 'px');
          c.style.setProperty('--ty', (Math.sin(angle) * dist) + 'px');
          c.style.setProperty('--tr', (Math.random() * 720) + 'deg');

          if (type !== 'hearts') {
            c.style.background = IS_CHROMA ? 'hsl(' + (Math.random() * 360) + ', 80%, 60%)' : 'var(--accent)';
          }

          c.style.animation = 'confetti-fall ' + (0.6 + Math.random() * 1.2) + 's ease-out forwards';
          elCard.appendChild(c);
          setTimeout(() => c.remove(), 2000);
        }
      }

      function getGoalCountFromState(state) {
        var type = CFG.goalType || 'follows';
        var platform = CFG.platform || 'all';

        // Map types to state fields
        var fieldMap = {
          'all': {
            'follows': 'totalFollows',
            'likes': 'totalLikes',
            'gifts': 'totalGiftCount',
            'subs': 'totalSubscriptions',
            'shares': 'totalShares',
            'raids': 'totalRaids',
            'viewers': 'currentViewerCount'
          },
          'twitch': {
            'follows': 'twitchFollows',
            'subs': 'twitchSubs'
          },
          'tiktok': {
            'follows': 'tiktokFollows',
            'likes': 'tiktokLikes',
            'gifts': 'tiktokGifts'
          }
        };

        var pMap = fieldMap[platform] || fieldMap['all'];
        var field = pMap[type] || fieldMap['all'][type] || 'totalFollows';

        return state[field] || 0;
      }

      function hydrate() {
        var isPreview = params.get('preview') === '1' || params.get('preview') === 'true' || params.get('test') === '1';
        return fetch('/overlay/goals/state', { cache: 'no-store' })
          .then(function(r) {
            if (!r.ok) throw new Error('Goals state fetch failed');
            return r.json();
          })
          .then(function(state) {
            var realCount = getGoalCountFromState(state);
            if (realCount > 0 || !isPreview) {
              update((CFG.startCount || 0) + realCount);
            } else if (isPreview) {
              update(Math.floor(CFG.goal * 0.75));
            } else {
              update(CFG.startCount || 0);
            }
          })
          .catch(function(err) {
            console.error('[overlay] Goal hydration error:', err);
            if (isPreview) update(Math.floor(CFG.goal * 0.75));
            else update(0);
          });
      }

      function connectSSE() {
        var isPreview = params.get('preview') === '1' || params.get('preview') === 'true' || params.get('test') === '1';
        var reconnectDelay = 1500;
        var src = new EventSource('/overlay/events?channel=goals');
        src.onmessage = function(e) {
          reconnectDelay = 1500;
          var msg = JSON.parse(e.data);
          if (msg.type === 'snapshot') {
            var count = getGoalCountFromState(msg.payload);
            if (count > 0 || !isPreview) {
              update((CFG.startCount || 0) + count);
            } else if (isPreview) {
              update(Math.floor(CFG.goal * 0.75));
            }
          } else if (msg.type === 'reload') {
            window.location.reload();
          }
        };
        src.onerror = function() {
          src.close();
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          setTimeout(connectSSE, reconnectDelay);
        };
      }

      hydrate().catch(console.error);
      connectSSE();
    </script>
  </body>
</html>`
}
