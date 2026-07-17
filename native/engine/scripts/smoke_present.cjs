/*
 * Smoke test: load the native engine addon under Electron's runtime and drive
 * the present pipe end to end (createEngine -> color texture -> setLayers ->
 * readPixels), then write the frame to a PNG and assert the composited pixels.
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

const addonPath = path.join(__dirname, '..', 'build', 'Release', 'ilystream_napi.node');
const engine = require(addonPath);

const W = 320;
const H = 240;

function sleep(ms) {
  // Blocks this (JS) thread without spinning; the engine's native render thread
  // keeps compositing while we wait.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// --- minimal PNG encoder (RGBA8) -------------------------------------------
function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? ((c >>> 1) ^ 0xedb88320) : (c >>> 1);
  }
  return (~c) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function writePng(file, w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw);
  fs.writeFileSync(file, Buffer.concat([
    sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0)),
  ]));
}
// ---------------------------------------------------------------------------

console.log('addon keys:', Object.keys(engine).join(', '));

engine.initializeSystem();
const eng = engine.createEngine({ width: W, height: H, fps: 60, enableValidation: false });
const tex = engine.engineCreateColorTexture(eng, 0xff00ff00); // opaque green

engine.engineSetLayers(eng, [{
  texture: tex,
  transform: {
    position: { x: 80, y: 60, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 160, y: 120, z: 1 },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    visibility: true,
    opacity: 1.0,
  },
  opacity: 1.0,
  blendMode: 1, // ILY_BLEND_ALPHA
}]);

sleep(80); // let the render thread composite a few frames

const buf = Buffer.alloc(W * H * 4);
const rp = engine.engineReadPixels(eng, buf);
console.log('readPixels ->', rp);

const at = (x, y) => (y * W + x) * 4;
const center = [buf[at(160, 120)], buf[at(160, 120) + 1], buf[at(160, 120) + 2], buf[at(160, 120) + 3]];
const corner = [buf[at(5, 5)], buf[at(5, 5) + 1], buf[at(5, 5) + 2]];
console.log('center(160,120) =', center, ' corner(5,5) =', corner);

const outPng = path.join(os.tmpdir(), 'ily_electron_present.png');
writePng(outPng, W, H, buf);
console.log('wrote', outPng);

engine.destroyEngine(eng);
engine.shutdownSystem();

const ok = rp.result === 0 && rp.width === W && rp.height === H &&
  center[1] > 200 && center[0] < 64 && center[2] < 64 &&
  corner[0] === 0x1e && corner[1] === 0x1e && corner[2] === 0x1e;
console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL');
process.exit(ok ? 0 : 1);
