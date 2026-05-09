import { PhysicsConfig, DEFAULT_PHYSICS_CONFIG } from '../../../shared/widgets'

export function buildPhysicsOverlayHtml(widget?: any, isPreview = false): string {
  const cfg: PhysicsConfig = { ...DEFAULT_PHYSICS_CONFIG, ...(widget?.config || {}) }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Physics Overlay</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js"></script>
  <style>
    body, html { 
      margin: 0; 
      padding: 0; 
      width: 100%; 
      height: 100%; 
      overflow: hidden;
      background: transparent; 
    }
    #canvas-container {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
    }
    canvas {
      display: block;
    }
  </style>
</head>
<body>
  <div id="canvas-container"></div>

  <script>
    const { Engine, Render, Runner, Bodies, Composite, Body, Events } = Matter;

    const cfg = ${JSON.stringify(cfg)};
    const container = document.getElementById('canvas-container');
    
    // Setup Engine
    const engine = Engine.create({
      gravity: { x: 0, y: cfg.gravity }
    });

    // Setup Renderer
    const render = Render.create({
      element: container,
      engine: engine,
      options: {
        width: window.innerWidth,
        height: window.innerHeight,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio
      }
    });

    Render.run(render);

    // Setup Runner
    const runner = Runner.create();
    Runner.run(runner, engine);

    // Walls
    let walls = [];
    function createWalls() {
      if (walls.length) Composite.remove(engine.world, walls);
      if (!cfg.enableWalls) return;

      const thickness = 100;
      const w = window.innerWidth;
      const h = window.innerHeight;

      walls = [
        // Ground
        Bodies.rectangle(w/2, h + thickness/2, w, thickness, { isStatic: true, label: 'wall' }),
        // Left
        Bodies.rectangle(-thickness/2, h/2, thickness, h, { isStatic: true, label: 'wall' }),
        // Right
        Bodies.rectangle(w + thickness/2, h/2, thickness, h, { isStatic: true, label: 'wall' })
      ];

      Composite.add(engine.world, walls);
    }

    createWalls();

    window.addEventListener('resize', () => {
      render.canvas.width = window.innerWidth;
      render.canvas.height = window.innerHeight;
      createWalls();
    });

    const activeObjects = new Set();

    function spawn(payload) {
      const { imageUrl, x = 0.5, size = 60, mass = 1, restitution = 0.6 } = payload;
      
      if (activeObjects.size >= cfg.maxObjects) {
        // Remove oldest
        const oldest = [...activeObjects][0];
        Composite.remove(engine.world, oldest);
        activeObjects.delete(oldest);
      }

      const spawnX = window.innerWidth * x;
      const spawnY = -size;

      const obj = Bodies.circle(spawnX, spawnY, size / 2, {
        restitution: restitution || cfg.restitution,
        friction: cfg.friction,
        render: {
          sprite: {
            texture: imageUrl,
            xScale: size / 100, // Assuming 100px base size for images
            yScale: size / 100
          }
        }
      });

      Body.setMass(obj, mass);
      
      Composite.add(engine.world, obj);
      activeObjects.add(obj);

      // Life timer
      setTimeout(() => {
        if (activeObjects.has(obj)) {
          Composite.remove(engine.world, obj);
          activeObjects.delete(obj);
        }
      }, cfg.particleLifeSec * 1000);
    }

    // SSE Connection
    function connectSSE() {
      const channel = 'physics';
      const src = new EventSource('/overlay/events?channel=' + channel);
      
      src.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'reload') { window.location.reload(); return; }
        if (msg.type === 'spawn') {
          spawn(msg.payload);
        }
      };

      src.onerror = () => {
        src.close();
        setTimeout(connectSSE, 2000);
      };
    }

    connectSSE();

    // Debug spawn for preview
    if (${isPreview}) {
      setInterval(() => {
        spawn({
          imageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + Math.random(),
          x: Math.random(),
          size: 40 + Math.random() * 40
        });
      }, 3000);
    }
  </script>
</body>
</html>`;
}
