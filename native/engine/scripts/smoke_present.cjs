/*
 * Smoke test: load the native engine addon under Electron's runtime and drive
 * the present pipe with a real uploaded image (createTextureFromPixels) — a
 * generated gradient composited full-frame, read back, written to a PNG and
 * checked against the source pixels.
 *
 * Run with Electron acting as Node (matches the addon's ABI):
 *   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe \
 *     native/engine/scripts/smoke_present.cjs
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');

const engine = require(path.join(__dirname, '..', 'build', 'Release', 'ilystream_napi.node'));
const W = 320;
const H = 240;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Same gradient the app's preview uses.
function makeGradientImage(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  const cx = w * 0.5, cy = h * 0.4, maxR = Math.hypot(w, h) * 0.6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, u = x / w, v = y / h;
      const r = 20 + u * 210, g = 200 * (1 - u) + v * 20, b = 255 - v * 120;
      const d = Math.hypot(x - cx, y - cy) / maxR;
      const hi = Math.max(0, 1 - d) ** 2 * 70;
      buf[i] = Math.min(255, r + hi) | 0;
      buf[i + 1] = Math.min(255, g + hi) | 0;
      buf[i + 2] = Math.min(255, b + hi) | 0;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

// --- minimal PNG encoder (RGBA8) -------------------------------------------
function crc32(b){let c=~0>>>0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c&1)?((c>>>1)^0xedb88320):(c>>>1);}return(~c)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const ty=Buffer.from(t,'ascii');const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([ty,d])),0);return Buffer.concat([l,ty,d,c]);}
function writePng(file,w,h,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;const s=w*4;const raw=Buffer.alloc((s+1)*h);for(let y=0;y<h;y++){raw[y*(s+1)]=0;rgba.copy(raw,y*(s+1)+1,y*s,(y+1)*s);}fs.writeFileSync(file,Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
// ---------------------------------------------------------------------------

console.log('addon keys:', Object.keys(engine).join(', '));

engine.initializeSystem();
const eng = engine.createEngine({ width: W, height: H, fps: 60, enableValidation: false });

const src = makeGradientImage(W, H);
const img = engine.engineCreateTextureFromPixels(eng, W, H, src);
console.log('created image texture:', img);

engine.engineSetLayers(eng, [{
  texture: img,
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, // native size
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    visibility: true,
    opacity: 1.0,
  },
  opacity: 1.0,
  blendMode: 1,
}]);

sleep(80);

const buf = Buffer.alloc(W * H * 4);
const rp = engine.engineReadPixels(eng, buf);
console.log('readPixels ->', rp);

// The image is drawn 1:1 opaque, so the readback should match the source.
const samples = [[10, 10], [160, 120], [300, 220], [50, 200]];
let maxDelta = 0;
for (const [x, y] of samples) {
  const i = (y * W + x) * 4;
  for (let c = 0; c < 3; c++) maxDelta = Math.max(maxDelta, Math.abs(buf[i + c] - src[i + c]));
}
console.log('max channel delta vs source (sampled):', maxDelta);

const outPng = path.join(os.tmpdir(), 'ily_electron_image.png');
writePng(outPng, W, H, buf);
console.log('wrote', outPng);

// Verify updateTexture: change the source in place, the readback must follow.
const red = Buffer.alloc(W * H * 4);
for (let i = 0; i < red.length; i += 4) { red[i] = 255; red[i+1] = 0; red[i+2] = 0; red[i+3] = 255; }
engine.engineUpdateTexture(eng, img, red);
sleep(60);
const buf2 = Buffer.alloc(W * H * 4);
engine.engineReadPixels(eng, buf2);
const mid = (120 * W + 160) * 4;
const updateOk = buf2[mid] > 200 && buf2[mid + 1] < 40 && buf2[mid + 2] < 40;
console.log('after updateTexture, center =', [buf2[mid], buf2[mid + 1], buf2[mid + 2]], updateOk ? '(red OK)' : '(FAIL)');

engine.destroyEngine(eng);
engine.shutdownSystem();

const ok = rp.result === 0 && rp.width === W && rp.height === H && maxDelta <= 6 && updateOk;
console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL');
process.exit(ok ? 0 : 1);
