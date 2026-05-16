import { RoseConfig, DEFAULT_ROSE_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

export function buildRoseOverlayHtml(widget?: any, isPreview = false): string {
  const cfg: RoseConfig = { ...DEFAULT_ROSE_CONFIG, ...(widget?.config || {}) }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Personalized Falling Rose Overlay</title>
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

        #rose-overlay-canvas {
            display: block;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
        }

        .rose-element {
            fill: black;
            stroke: url(#rose-gradient);
            stroke-width: 1.5px;
            stroke-linejoin: round;
            stroke-linecap: round;
        }
    </style>
</head>
<body>
    <svg id="rose-overlay-canvas" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <defs>
            <linearGradient id="rose-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${cfg.secondaryColor}">
                    <animate attributeName="stop-color"
                             values="${cfg.primaryColor}; ${cfg.secondaryColor}; ${cfg.primaryColor};"
                             dur="2s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stop-color="${cfg.primaryColor}">
                    <animate attributeName="stop-color"
                             values="${cfg.secondaryColor}; ${cfg.primaryColor}; ${cfg.secondaryColor};"
                             dur="2s" repeatCount="indefinite" />
                </stop>
                <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="3s" repeatCount="indefinite" />
            </linearGradient>

            <symbol id="rose-path-symbol" viewBox="0 0 100 100">
                <path class="rose-element" d="M 45,48 C 45,43 55,42 53,49 C 52,53 47,52 45,48 Z" />
                <path class="rose-element" d="M 43,45 C 40,38 58,35 60,45 C 62,55 45,58 43,45 Z" />
                <path class="rose-element" d="M 38,48 C 35,35 65,30 68,48 C 70,60 40,65 38,48 Z" />
                <path class="rose-element" d="M 38,48 C 30,55 35,70 50,70 C 60,70 65,60 68,48 C 65,55 45,58 38,48 Z" />
                <path class="rose-element" d="M 38,48 C 25,40 30,20 50,22 C 65,25 65,35 60,45 C 55,35 40,35 38,48 Z" />
                <path class="rose-element" d="M 28,45 C 15,50 15,75 40,85 C 55,90 75,80 80,60 C 85,45 75,30 68,48 C 75,55 55,75 40,70 C 30,65 25,55 28,45 Z" />
                <path class="rose-element" d="M 40,22 C 20,15 5,35 15,55 C 20,65 30,70 40,70 C 25,65 15,50 25,35 C 30,25 45,25 50,30 C 55,20 45,15 40,22 Z" />
                <path class="rose-element" d="M 60,25 C 75,15 95,30 90,55 C 88,65 78,75 68,75 C 80,65 85,45 75,35 C 70,30 55,30 50,35 C 50,25 60,20 60,25 Z" />
                <path class="rose-element" d="M 15,55 C 0,70 15,95 45,95 C 65,95 85,90 95,70 C 98,55 90,40 85,45 C 90,55 80,80 50,85 C 25,85 10,70 20,55 Z" />
                <path class="rose-element" d="M 30,25 C 10,5 50,0 70,10 C 85,15 95,30 90,40 C 85,25 70,15 55,15 C 40,15 25,25 20,40 C 15,30 20,15 30,25 Z" />
            </symbol>
        </defs>
        <g id="particle-container"></g>
    </svg>

    <script>
        const config = {
            count: ${cfg.count},
            baseSpeed: ${cfg.speed},
            scale: ${cfg.scale},
            wobbleAmp: 12,
            wobbleFreq: 0.015,
            scaleRange: [0.15, 0.35]
        };

        const container = document.getElementById('particle-container');
        const particles = [];

        function randomFloat(min, max) {
            return Math.random() * (max - min) + min;
        }

        function createParticle(x) {
            const scale = randomFloat(config.scaleRange[0], config.scaleRange[1]) * config.scale;
            const pXPercent = x + randomFloat(-3, 3);
            const wobbleOffset = randomFloat(0, Math.PI * 2);

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('class', 'particle-rose');

            const useRose = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            useRose.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#rose-path-symbol');
            group.appendChild(useRose);

            container.appendChild(group);

            return {
                dom: group,
                xPercent: pXPercent,
                yPercent: randomFloat(-20, -5),
                ySpeed: config.baseSpeed * randomFloat(0.8, 1.4),
                scale: scale,
                rotation: randomFloat(-180, 180),
                rotationSpeed: randomFloat(-0.8, 0.8),
                wobbleOffset: wobbleOffset,
                age: 0
            };
        }

        function update() {
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.yPercent += p.ySpeed;
                p.age += 1;
                p.rotation += p.rotationSpeed;

                const sinInput = (p.age + p.wobbleOffset) * config.wobbleFreq;
                const windDriftPercent = Math.sin(sinInput) * (config.wobbleAmp / 10);
                const finalX = p.xPercent + windDriftPercent;

                const lifeFactor = p.yPercent / 100;
                let opacity = 1;
                if (lifeFactor > 0.85) {
                    opacity = Math.max(0, 1 - ((lifeFactor - 0.85) / 0.15));
                }

                const finalXCoord = finalX * 10;
                const finalYCoord = p.yPercent * 10;

                p.dom.setAttribute('transform', \`translate(\${finalXCoord}, \${finalYCoord}) scale(\${p.scale}) rotate(\${p.rotation}) translate(-50, -50)\`);
                p.dom.style.opacity = opacity;

                if (p.yPercent > 115 || opacity <= 0.001) {
                    container.removeChild(p.dom);
                    particles.splice(i, 1);
                }
            }
            requestAnimationFrame(update);
        }

        function burst() {
            for (let i = 0; i < config.count; i++) {
                setTimeout(() => {
                    particles.push(createParticle(randomFloat(2, 98)));
                }, i * 50);
            }
        }

        function connectSSE() {
            var src = new EventSource('/overlay/events?channel=falling-roses');
            src.onmessage = function(e) {
                var msg = JSON.parse(e.data);
                if (msg.type === 'reload') window.location.reload();
                if (msg.type === 'event' && msg.payload.type === 'gift' && (msg.payload.giftName || '').toLowerCase().includes('rose')) {
                    burst();
                }
            };
            src.onerror = function() {
                src.close();
                setTimeout(connectSSE, 2000);
            };
        }

        document.addEventListener('DOMContentLoaded', () => {
            requestAnimationFrame(update);
            ${isPreview ? `burst(); setInterval(burst, 5000);` : ''}
            connectSSE();
        });
    </script>
</body>
</html>`
}
