/*
 * Control experiment for the camera smoke test: composite a DXGI screen-capture
 * shared texture and read it back. Same import mechanism
 * (CreateSharedTextureFromHandle -> bgfx overrideInternal), known-good code.
 * If this is black too, the cross-device shared-texture import is what's broken,
 * not the camera.
 *
 *   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe \
 *     native/engine/scripts/smoke_screen.cjs
 */
'use strict';
const path = require('path');
const engine = require(path.join(__dirname, '..', 'build', 'Release', 'ilystream_napi.node'));

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const displays = engine.listScreenCaptureDisplays();
console.log('displays:', displays.length);
if (displays.length === 0) { console.log('SKIP (no displays)'); process.exit(0); }

const W = 1920, H = 1080;
engine.initializeSystem();
const eng = engine.createEngine({ width: W, height: H, fps: 60, enableValidation: false });

const capture = engine.engineCreateScreenCapture(eng, 0, 30);
console.log('screen capture:', JSON.stringify(capture.description));

engine.engineSetLayers(eng, [{
  texture: capture.texture,
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: W / capture.description.width, y: H / capture.description.height, z: 1 },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    visibility: true,
    opacity: 1.0,
  },
  opacity: 1.0,
  blendMode: 1,
}]);

sleep(500);
const buf = Buffer.alloc(W * H * 4);
console.log('readPixels ->', engine.engineReadPixels(eng, buf));

let sum = 0, sumSq = 0, count = 0;
for (let i = 0; i < buf.length; i += 4 * 37) {
  const y = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
  sum += y; sumSq += y * y; count++;
}
const mean = sum / count;
const variance = sumSq / count - mean * mean;
console.log('luma mean:', mean.toFixed(1), 'variance:', variance.toFixed(1));

engine.destroyEngine(eng);
engine.shutdownSystem();
const ok = variance > 25 && mean > 2;
console.log(ok ? 'SCREEN SHARED-TEXTURE OK' : 'SCREEN SHARED-TEXTURE BLANK');
process.exit(ok ? 0 : 1);
