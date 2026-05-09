export function buildGoalsOverlayHtml(widget?: any, isPreview = false): string {
  // Simple multi-goal display that uses the OverlayGoalState from /overlay/goals/state
  return `<!doctype html>
<html lang="en" style="background: transparent !important; background-color: transparent !important;">
  <head>
    <meta charset="UTF-8" />
    <title>ilyStream Unified Goals</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Segoe UI", "Inter", system-ui, sans-serif;
      }
      body {
        background: transparent;
        color: #fff;
        margin: 0;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: flex-end;
      }
      .goal-item {
        background: rgba(8, 10, 18, 0.7);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 180px;
        animation: slide-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .goal-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
      }
      .goal-info {
        flex: 1;
      }
      .goal-label {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        opacity: 0.4;
      }
      .goal-value {
        font-size: 18px;
        font-weight: 800;
        margin-top: -2px;
      }
      @keyframes slide-in {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
    </style>
  </head>
  <body>
    <div id="goals-container"></div>
    <script>
      const container = document.getElementById('goals-container');

      function render(state) {
        container.innerHTML = '';
        
        const metrics = [
          { label: 'Followers', value: state.totalFollows, icon: '👤' },
          { label: 'Likes', value: state.totalLikes, icon: '❤️' },
          { label: 'Gifts', value: state.totalGiftCount, icon: '🎁' }
        ];

        metrics.forEach((m, i) => {
          const div = document.createElement('div');
          div.className = 'goal-item';
          div.style.animationDelay = (i * 0.1) + 's';
          div.innerHTML = \`
            <div class="goal-icon">\${m.icon}</div>
            <div class="goal-info">
              <div class="goal-label">\${m.label}</div>
              <div class="goal-value">\${m.value.toLocaleString()}</div>
            </div>
          \`;
          container.appendChild(div);
        });
      }

      function hydrate() {
        fetch('/overlay/goals/state')
          .then(r => r.json())
          .then(render)
          .catch(console.error);
      }

      const src = new EventSource('/overlay/events?channel=goals');
      src.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'snapshot') render(msg.payload);
      };

      hydrate();
    </script>
  </body>
</html>`;
}
