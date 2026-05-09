import { LatestGifterConfig, DEFAULT_LATEST_GIFTER_CONFIG } from '../../../shared/widgets'

export function buildLatestGifterHtml(widget?: any, isPreview = false): string {
  const cfg: LatestGifterConfig = { ...DEFAULT_LATEST_GIFTER_CONFIG, ...(widget?.config || {}) }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Latest Gifter</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    body, html {
      margin: 0;
      padding: 0;
      ${cfg.forceTikTokDimensions ? 'width: 1080px; height: 1920px;' : 'width: 100vw; height: 100vh;'}
      overflow: hidden;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Outfit', sans-serif;
    }

    .widget-container {
      position: relative;
      ${cfg.forceTikTokDimensions ? '' : (
        cfg.aspectRatio === 'tiktok' ? 'aspect-ratio: 9/16; height: 100%; width: auto;' :
        cfg.aspectRatio === 'landscape' ? 'aspect-ratio: 16/9; width: 100%; height: auto;' : 'width: 100%; height: 100%;'
      )}
      display: flex;
      align-items: center;
      justify-content: center;
      transform: scale(${cfg.scale});
      opacity: ${cfg.opacity};
      pointer-events: none;
    }

    /* Tikfinity Rip-off Style */
    .gifter-pill {
      display: flex;
      align-items: center;
      background: rgba(0, 0, 0, 0.85);
      border-radius: 50px;
      padding: 4px 24px 4px 6px;
      gap: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      position: relative;
      min-width: 200px;
    }

    /* Liquid Gradient Border */
    .gifter-pill::after {
      content: '';
      position: absolute;
      inset: -1px;
      background: linear-gradient(90deg, ${cfg.primaryColor}, ${cfg.secondaryColor}, ${cfg.primaryColor});
      background-size: 200% 100%;
      border-radius: 50px;
      z-index: -1;
      animation: gradient-flow 3s linear infinite;
    }

    @keyframes gradient-flow {
      0% { background-position: 0% 0; }
      100% { background-position: 200% 0; }
    }

    .avatar-circle {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid #fff;
      flex-shrink: 0;
      background: #111;
      box-shadow: 0 0 15px rgba(0,0,0,0.5);
    }

    .avatar-circle img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .text-stack {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .label {
      font-size: 9px;
      font-weight: 900;
      color: ${cfg.primaryColor};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: -1px;
    }

    .username {
      font-size: 19px;
      font-weight: 800;
      color: #fff;
      line-height: 1.1;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }

    /* Update Animation */
    .update-anim {
      animation: tikfinity-pop 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    @keyframes tikfinity-pop {
      0% { transform: scale(1); }
      30% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }
  </style>
</head>
<body>
  <div class="widget-container">
    <div class="gifter-pill" id="widget">
      <div class="avatar-circle">
        <img src="https://via.placeholder.com/100" id="avatar" alt="">
      </div>
      <div class="text-stack">
        <div class="label">${cfg.label}</div>
        <div class="username" id="name">Waiting...</div>
      </div>
    </div>
  </div>

  <script>
    const nameEl = document.getElementById('name');
    const avatarEl = document.getElementById('avatar');
    const widgetEl = document.getElementById('widget');

    function updateGifter(name, avatar) {
      if (name) nameEl.innerText = name;
      if (avatar) avatarEl.src = avatar;
      
      widgetEl.classList.remove('update-anim');
      void widgetEl.offsetWidth; 
      widgetEl.classList.add('update-anim');
    }

    var src = new EventSource('/overlay/events?channel=latest-gifter');
    src.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      if (msg.type === 'reload') window.location.reload();
      if (msg.type === 'update') {
        updateGifter(msg.data.username, msg.data.avatarUrl);
      }
    };

    fetch('/overlay/state/latest-gifter')
      .then(r => r.json())
      .then(data => {
        if (data && data.username) {
          updateGifter(data.username, data.avatarUrl);
        }
      });
  </script>
</body>
</html>`
}
