import { NodeNetworkConfig, DEFAULT_NODE_NETWORK_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

export function buildNodeNetworkHtml(widget?: any, isPreview = false): string {
  const cfg: NodeNetworkConfig = { ...DEFAULT_NODE_NETWORK_CONFIG, ...(widget?.config || {}) }

  // Helper to convert hex to RGB for canvas
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '25, 200, 255';
  }

  const primaryRgb = hexToRgb(cfg.primaryColor);
  const secondaryRgb = hexToRgb(cfg.secondaryColor);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Setae Agent Node Network</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            ${cfg.forceTikTokDimensions ? 'width: 1080px; height: 1920px;' : 'width: 100vw; height: 100vh;'}
            overflow: hidden;
            background-color: transparent;
        }

        .canvas-container {
            position: relative;
            ${cfg.forceTikTokDimensions ? 'width: 1080px; height: 1920px;' : (
                cfg.aspectRatio === 'tiktok' ? 'aspect-ratio: 9/16; height: 100%; width: auto; margin: 0 auto;' :
                cfg.aspectRatio === 'landscape' ? 'aspect-ratio: 16/9; width: 100%; height: auto; margin: auto 0;' : 'width: 100%; height: 100%;'
            )}
            opacity: ${cfg.opacity};
        }
        ${getAnimationCss({ style: cfg.animationStyle || 'fade', duration: cfg.animationDuration || 1200 }, '.canvas-container')}

        #node-canvas {
            display: block;
            width: 100%;
            height: 100%;
            filter: drop-shadow(0px 0px 4px rgba(${primaryRgb}, 0.2));
        }
    </style>
</head>
<body>
    <div class="canvas-container">
        <canvas id="node-canvas"></canvas>
    </div>
    <script>
        const canvas = document.getElementById('node-canvas');
        const ctx = canvas.getContext('2d', { alpha: true });

        const config = {
            nodeCount: ${cfg.nodeCount},
            maxDistance: ${cfg.maxDistance},
            baseSpeed: ${cfg.speed},
            primary: '${primaryRgb}',
            secondary: '${secondaryRgb}'
        };

        let nodes = [];
        let w, h;
        let isAITalking = false;

        // Scale factors based on resolution to keep look consistent
        let densityMultiplier = 1.0;
        let distanceMultiplier = 1.0;

        function resize() {
            const ratio = window.devicePixelRatio || 1;
            w = canvas.width = window.innerWidth * ratio;
            h = canvas.height = window.innerHeight * ratio;

            // Calculate multipliers based on a reference resolution of 800x600
            densityMultiplier = (w * h) / (800 * 600 * ratio * ratio);
            distanceMultiplier = Math.sqrt(w * h) / Math.sqrt(800 * 600 * ratio * ratio);

            ctx.scale(ratio, ratio);
            w /= ratio;
            h /= ratio;

            initNodes();
        }

        class Node {
            constructor() {
                this.x = Math.random() * w;
                this.y = Math.random() * h;
                this.vx = (Math.random() - 0.5) * config.baseSpeed;
                this.vy = (Math.random() - 0.5) * config.baseSpeed;
                this.baseRadius = Math.random() * 1.5 + 1;
                this.radius = this.baseRadius;
                this.isPulsing = false;
                this.pulseLife = 0;
            }

            update() {
                // Now 2x faster instead of 4x
                const multiplier = isAITalking ? 2.0 : 1.0;
                this.x += this.vx * multiplier;
                this.y += this.vy * multiplier;

                if (this.x < 0 || this.x > w) this.vx *= -1;
                if (this.y < 0 || this.y > h) this.vy *= -1;

                if (this.isPulsing) {
                    this.pulseLife -= 0.025; // Slightly faster decay for snappier pulses
                    this.radius = this.baseRadius + (this.pulseLife * 3.5);
                    if (this.pulseLife <= 0) {
                        this.isPulsing = false;
                        this.radius = this.baseRadius;
                    }
                }
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

                if (this.isPulsing) {
                    const alpha = this.pulseLife + 0.4;
                    ctx.fillStyle = 'rgba(' + config.secondary + ', ' + alpha + ')';
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = 'rgb(' + config.secondary + ')';
                } else {
                    ctx.fillStyle = 'rgba(' + config.primary + ', 0.85)';
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = 'rgb(' + config.primary + ')';
                }

                ctx.fill();
                ctx.shadowBlur = 0;
            }

            pulse() {
                if (this.isPulsing) return; // Don't re-pulse
                this.isPulsing = true;
                this.pulseLife = 1.0;
            }
        }

        function initNodes() {
            nodes = [];
            const finalCount = Math.min(Math.floor(config.nodeCount * Math.max(1, densityMultiplier * 0.5)), 400);
            for (let i = 0; i < finalCount; i++) {
                nodes.push(new Node());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, w, h);

            // Random neural bursts - much more frequent when talking
            if (isAITalking && Math.random() < 0.6) {
                const flareCount = Math.floor(Math.random() * 4) + 1;
                for(let k=0; k<flareCount; k++) {
                    const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
                    if (randomNode) randomNode.pulse();
                }
            }

            const maxDist = config.maxDistance * Math.max(1, distanceMultiplier * 0.7);

            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    let dx = nodes[i].x - nodes[j].x;
                    let dy = nodes[i].y - nodes[j].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < maxDist) {
                        ctx.beginPath();
                        ctx.moveTo(nodes[i].x, nodes[i].y);
                        ctx.lineTo(nodes[j].x, nodes[j].y);
                        let opacity = 1 - (distance / maxDist);

                        if (nodes[i].isPulsing || nodes[j].isPulsing) {
                            let pulseIntensity = Math.max(nodes[i].pulseLife || 0, nodes[j].pulseLife || 0);
                            ctx.strokeStyle = 'rgba(' + config.secondary + ', ' + (opacity * (pulseIntensity + 0.3)) + ')';
                            ctx.lineWidth = 3.0;
                        } else {
                            ctx.strokeStyle = 'rgba(' + config.primary + ', ' + (opacity * 0.65) + ')';
                            ctx.lineWidth = 1.2;
                        }
                        ctx.stroke();
                    }
                }
            }

            for (let node of nodes) {
                node.update();
                node.draw();
            }
            requestAnimationFrame(animate);
        }

        window.addEventListener('resize', resize);
        resize();

        setInterval(() => {
            if (isAITalking) return;
            let flares = Math.floor(Math.random() * 2) + 1;
            for(let i=0; i<flares; i++) {
                let randomNode = nodes[Math.floor(Math.random() * nodes.length)];
                if (randomNode) randomNode.pulse();
            }
        }, 1500);

        animate();

        var src = new EventSource('/overlay/events?channel=node-network');
        src.onmessage = function(e) {
            var msg = JSON.parse(e.data);
            if (msg.type === 'reload') window.location.reload();
            if (msg.type === 'speech-state') {
                isAITalking = msg.isSpeaking && msg.isAI;
                console.log('[Nodes] Speech State Changed:', isAITalking);
            }
        };
    </script>
</body>
</html>`
}
