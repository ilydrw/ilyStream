/*
 * Smoke test: Media Foundation camera capture -> engine texture -> composite ->
 * readback. Proves the native camera path end-to-end with no renderer, no
 * getUserMedia and no RGBA frames crossing IPC.
 *
 * It opens the machine's camera. To keep that as private as possible the test
 * only reports STATISTICS (mean/variance/motion between two frames) and writes
 * the PNG for a human to look at; nothing decodes or inspects the image here.
 *
 * Run with Electron acting as Node (matches the addon's ABI):
 *   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe \
 *     native/engine/scripts/smoke_camera.cjs [device name substring]
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');

const engine = require(path.join(__dirname, '..', 'build', 'Release', 'ilystream_napi.node'));

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// --- minimal PNG encoder (RGBA8) -------------------------------------------
function crc32(b){let c=~0>>>0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c&1)?((c>>>1)^0xedb88320):(c>>>1);}return(~c)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const ty=Buffer.from(t,'ascii');const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([ty,d])),0);return Buffer.concat([l,ty,d,c]);}
function writePng(file,w,h,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;const s=w*4;const raw=Buffer.alloc((s+1)*h);for(let y=0;y<h;y++){raw[y*(s+1)]=0;rgba.copy(raw,y*(s+1)+1,y*s,(y+1)*s);}fs.writeFileSync(file,Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
// ---------------------------------------------------------------------------

/** Luma mean + variance over a subsample, so we can tell a real frame from a flat one. */
function lumaStats(buf) {
  let sum = 0, sumSq = 0, count = 0;
  for (let i = 0; i < buf.length; i += 4 * 37) {
    const y = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
    sum += y; sumSq += y * y; count++;
  }
  const mean = sum / count;
  return { mean, variance: sumSq / count - mean * mean };
}

/** Mean absolute luma difference between two readbacks — proves frames keep arriving. */
function motion(a, b) {
  let total = 0, count = 0;
  for (let i = 0; i < a.length; i += 4 * 37) {
    const ya = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
    const yb = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
    total += Math.abs(ya - yb); count++;
  }
  return total / count;
}

const requested = process.argv[2] || '';

const devices = engine.listCameraCaptureDevices();
console.log(`cameras (${devices.length}):`);
for (const device of devices) console.log(`  - ${device.friendlyName}`);
if (devices.length === 0) {
  console.log('SMOKE SKIP (no camera devices)');
  process.exit(0);
}

const picked = requested
  ? devices.find((d) => d.friendlyName.toLowerCase().includes(requested.toLowerCase()))
  : devices[0];
if (!picked) {
  console.log(`SMOKE FAIL (no camera matching "${requested}")`);
  process.exit(1);
}

const W = Number(process.env.ILY_SMOKE_W || 1920);
const H = Number(process.env.ILY_SMOKE_H || 1080);

engine.initializeSystem();
const eng = engine.createEngine({ width: W, height: H, fps: 60, enableValidation: false });

const startedAt = Date.now();
let capture;
try {
  capture = engine.engineCreateCameraCapture(eng, picked.friendlyName, W, H, 30);
} catch (err) {
  console.log('engineCreateCameraCapture threw:', err.message);
  engine.destroyEngine(eng);
  engine.shutdownSystem();
  console.log('SMOKE FAIL');
  process.exit(1);
}
const openMs = Date.now() - startedAt;
console.log('opened in', openMs, 'ms:', JSON.stringify(capture.description));

const { width: cw, height: ch } = capture.description;
engine.engineSetLayers(eng, [{
  texture: capture.texture,
  transform: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    // Fill the output regardless of the negotiated camera size.
    scale: { x: W / cw, y: H / ch, z: 1 },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    visibility: true,
    opacity: 1.0,
  },
  opacity: 1.0,
  blendMode: 1,
}]);

sleep(300);
const first = Buffer.alloc(W * H * 4);
const rp = engine.engineReadPixels(eng, first);
sleep(400);
const second = Buffer.alloc(W * H * 4);
engine.engineReadPixels(eng, second);

const stats = lumaStats(second);
const delta = motion(first, second);
console.log('readPixels ->', rp);
console.log('luma mean:', stats.mean.toFixed(1), 'variance:', stats.variance.toFixed(1));
console.log('mean |luma| change between reads:', delta.toFixed(2));

const outPng = path.join(os.tmpdir(), 'ily_camera_smoke.png');
writePng(outPng, W, H, second);
console.log('wrote', outPng, '(look at this to confirm the picture is right)');

engine.engineDestroyTexture(eng, capture.texture);
engine.destroyEngine(eng);
engine.shutdownSystem();

// A real camera frame is neither black nor a flat fill; variance is the check
// that survives without anyone looking at the image.
const ok = rp.result === 0 && stats.variance > 25 && stats.mean > 2;
console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL (frame looks blank — variance/mean too low)');
process.exit(ok ? 0 : 1);
