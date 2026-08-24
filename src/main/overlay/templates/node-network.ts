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
            // Very high desktop scale factors multiply every full-screen
            // clear, line and glow. Two physical pixels per CSS pixel is
            // already beyond what a browser-source composite can resolve.
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            w = canvas.width = window.innerWidth * ratio;
            h = canvas.height = window.innerHeight * ratio;

            // Calculate multipliers based on a reference resolution of 800x600
            densityMultiplier = (w * h) / (800 * 600 * ratio * ratio);
            distanceMultiplier = Math.sqrt(w * h) / Math.sqrt(800 * 600 * ratio * ratio);

            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
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

            update(frameScale) {
                // Now 2x faster instead of 4x
                const multiplier = isAITalking ? 2.0 : 1.0;
                this.x += this.vx * multiplier * frameScale;
                this.y += this.vy * multiplier * frameScale;

                if (this.x < 0 || this.x > w) this.vx *= -1;
                if (this.y < 0 || this.y > h) this.vy *= -1;

                if (this.isPulsing) {
                    this.pulseLife -= 0.025 * frameScale; // Keep timing stable across 30/60fps captures
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

        function buildSpatialGrid(cellSize) {
            const grid = new Map();
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const key = Math.floor(node.x / cellSize) + ',' + Math.floor(node.y / cellSize);
                const bucket = grid.get(key);
                if (bucket) bucket.push(i);
                else grid.set(key, [i]);
            }
            return grid;
        }

        let lastFrameAt = 0;
        function animate(now) {
            // Motion was historically tuned at 60fps. Use elapsed time so a
            // dropped frame advances the animation instead of slowing it down,
            // while clamping long stalls to avoid visible teleports.
            const frameScale = lastFrameAt ? Math.min(3, Math.max(0.25, (now - lastFrameAt) / (1000 / 60))) : 1;
            lastFrameAt = now;
            ctx.clearRect(0, 0, w, h);

            // Random neural bursts - much more frequent when talking
            if (isAITalking && Math.random() < 1 - Math.pow(0.4, frameScale)) {
                const flareCount = Math.floor(Math.random() * 4) + 1;
                for(let k=0; k<flareCount; k++) {
                    const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
                    if (randomNode) randomNode.pulse();
                }
            }

            const maxDist = config.maxDistance * Math.max(1, distanceMultiplier * 0.7);
            const maxDistSq = maxDist * maxDist;
            const cellSize = Math.max(1, maxDist);
            const grid = buildSpatialGrid(cellSize);

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const cellX = Math.floor(node.x / cellSize);
                const cellY = Math.floor(node.y / cellSize);
                for (let offsetY = -1; offsetY <= 1; offsetY++) {
                    for (let offsetX = -1; offsetX <= 1; offsetX++) {
                        const bucket = grid.get((cellX + offsetX) + ',' + (cellY + offsetY));
                        if (!bucket) continue;
                        for (let bucketIndex = 0; bucketIndex < bucket.length; bucketIndex++) {
                            const j = bucket[bucketIndex];
                            if (j <= i) continue;
                            const other = nodes[j];
                            const dx = node.x - other.x;
                            const dy = node.y - other.y;
                            const distanceSq = dx * dx + dy * dy;
                            if (distanceSq >= maxDistSq) continue;

                            const opacity = 1 - (Math.sqrt(distanceSq) / maxDist);
                            ctx.beginPath();
                            ctx.moveTo(node.x, node.y);
                            ctx.lineTo(other.x, other.y);

                            if (node.isPulsing || other.isPulsing) {
                                const pulseIntensity = Math.max(node.pulseLife || 0, other.pulseLife || 0);
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
            }

            for (let node of nodes) {
                node.update(frameScale);
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

        requestAnimationFrame(animate);

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
