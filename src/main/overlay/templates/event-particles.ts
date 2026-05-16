import { ParticleConfig, DEFAULT_PARTICLE_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

export function buildParticleOverlayHtml(widget?: any, isPreview = false): string {
  const cfg: ParticleConfig = { ...DEFAULT_PARTICLE_CONFIG, ...(widget?.config || {}) }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ILY Follower Overlay</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background-color: transparent;
            position: relative;
        }
        ${getAnimationCss({ style: cfg.animationStyle || 'fade', duration: cfg.animationDuration || 800 }, 'body')}

        :root {
            --primary-color: ${cfg.primaryColor};
            --secondary-color: ${cfg.secondaryColor};
            --text-color: ${cfg.textColor};
        }

        #heart-overlay-canvas {
            display: block;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
        }

        .heart-base {
            fill: #000000;
            stroke: none;
        }
    </style>
</head>
<body>
    <svg id="heart-overlay-canvas" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <defs>
            <linearGradient id="cyber-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${cfg.primaryColor}">
                  <animate attributeName="stop-color" values="${cfg.primaryColor}; ${cfg.secondaryColor}; ${cfg.primaryColor}" dur="2s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stop-color="${cfg.secondaryColor}">
                  <animate attributeName="stop-color" values="${cfg.secondaryColor}; ${cfg.primaryColor}; ${cfg.secondaryColor}" dur="2s" repeatCount="indefinite" />
                </stop>
                <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="3s" repeatCount="indefinite" />
            </linearGradient>

            <symbol id="heart-path-symbol" viewBox="-5 -5 42 42">
                <path class="heart-base"
                      d="M16 4C19.3333 1 24.3333 1 27.6667 4.33333C31 7.66667 31 12.6667 27.6667 16L16 27.6667L4.33333 16C1 12.6667 1 7.66667 4.33333 4.33333C7.66667 1 12.6667 1 16 4Z" />
                <path d="M16 4C19.3333 1 24.3333 1 27.6667 4.33333C31 7.66667 31 12.6667 27.6667 16L16 27.6667L4.33333 16C1 12.6667 1 7.66667 4.33333 4.33333C7.66667 1 12.6667 1 16 4Z"
                      style="fill: none; stroke: url(#cyber-gradient); stroke-width: 4px; stroke-linecap: round;" />
            </symbol>
        </defs>
        <g id="particle-container"></g>
    </svg>

    <script>
        const canvas = document.getElementById('heart-overlay-canvas');
        const container = document.getElementById('particle-container');

        const config = {
            count: ${cfg.count},
            baseSpeed: ${cfg.speed},
            wobbleAmp: 30,
            wobbleFreq: 0.015,
            scaleRange: [${cfg.scale * 0.7}, ${cfg.scale * 1.2}],
            font: "'Inter', sans-serif",
            textColor: "var(--text-color)",
            text: "${cfg.text}",
            eventDriven: ${cfg.eventDriven},
            audioReactive: ${cfg.audioReactive === true},
            audioThreshold: ${cfg.audioThreshold || 0.05}
        };

        const particles = [];

        function randomFloat(min, max) {
            return Math.random() * (max - min) + min;
        }

        function createParticle(x) {
            const scale = randomFloat(config.scaleRange[0], config.scaleRange[1]);
            const ySpeed = config.baseSpeed * scale;
            const pXPercent = x + randomFloat(-5, 5);
            const wobbleOffset = randomFloat(0, Math.PI * 2);
            const displayText = config.text || 'ily!';

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('class', 'particle-heart');

            const useHeart = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            useHeart.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#heart-path-symbol');
            useHeart.setAttribute('width', '40');
            useHeart.setAttribute('height', '40');
            useHeart.setAttribute('x', '-20');
            useHeart.setAttribute('y', '-20');
            group.appendChild(useHeart);

            const textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textNode.setAttribute('x', '0');
            textNode.setAttribute('y', '2');
            textNode.setAttribute('font-family', config.font);
            textNode.setAttribute('font-weight', '700');
            textNode.setAttribute('font-size', '12px');
            textNode.setAttribute('fill', config.textColor);
            textNode.setAttribute('text-anchor', 'middle');
            textNode.textContent = displayText;
            group.appendChild(textNode);

            container.appendChild(group);

            return {
                dom: group,
                xPercent: pXPercent,
                yPercent: 110,
                ySpeed: ySpeed,
                scale: scale,
                wobbleOffset: wobbleOffset,
                age: 0
            };
        }

        function update() {
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.yPercent -= p.ySpeed;

                const sinInput = (p.age + p.wobbleOffset) * config.wobbleFreq;
                const windDriftPercent = Math.sin(sinInput) * (config.wobbleAmp / (10 + p.scale));
                const finalX = p.xPercent + windDriftPercent;

                p.age += 1;

                const lifeFactor = Math.max(0, p.yPercent) / 100;
                let opacity = 1;
                if (lifeFactor < 0.2) {
                    opacity = Math.max(0, lifeFactor / 0.2);
                }

                const finalXCoord = finalX * 10;
                const finalYCoord = p.yPercent * 10;

                const baseTransform = \`translate(\${finalXCoord}, \${finalYCoord})\`;
                let volScale = 1;
                if (config.audioReactive) {
                    let vol = (window.parent && window.parent.__masterVolume) || window.__masterVolume || 0;
                    if (vol < config.audioThreshold) vol = 0;
                    volScale = 1 + (vol * 1.5);
                }
                const scaleTransform = \`scale(\${p.scale * volScale})\`;
                p.dom.setAttribute('transform', \`\${baseTransform} \${scaleTransform}\`);
                p.dom.style.opacity = opacity;

                if (p.yPercent < -20 || opacity <= 0.001) {
                    container.removeChild(p.dom);
                    particles.splice(i, 1);
                }
            }
            requestAnimationFrame(update);
        }

        function spawnParticles() {
            if (!config.eventDriven) {
              for (let i = 0; i < config.count; i++) {
                  particles.push(createParticle(randomFloat(5, 95)));
              }
            }
            requestAnimationFrame(update);

            if (!config.eventDriven) {
              setInterval(() => {
                  if (particles.length < config.count) {
                      particles.push(createParticle(randomFloat(5, 95)));
                  }
              }, 300);
            }
        }

        function connectSSE() {
            var src = new EventSource('/overlay/events?channel=event-particles');
            src.onmessage = function(e) {
                var msg = JSON.parse(e.data);
                if (msg.type === 'reload') window.location.reload();
                if (msg.type === 'event' && msg.payload.type === 'follow') {
                    const burstCount = config.eventDriven ? config.count : 10;
                    for (let i = 0; i < burstCount; i++) {
                        setTimeout(() => {
                            particles.push(createParticle(randomFloat(10, 90)));
                        }, i * 50);
                    }
                }
            };
            src.onerror = function() {
                src.close();
                setTimeout(connectSSE, 2000);
            };
        }

        document.addEventListener('DOMContentLoaded', () => {
            spawnParticles();
            connectSSE();
        });
    </script>
</body>
</html>`
}
