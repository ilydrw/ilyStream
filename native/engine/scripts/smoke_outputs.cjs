/*
 * Smoke test: two outputs on one engine through the ADDON (not just C++).
 * Proves the napi/TS surface drives per-output layer lists and readback.
 *
 *   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe \
 *     native/engine/scripts/smoke_outputs.cjs
 */
'use strict';
const path = require('path');
const engine = require(path.join(__dirname, '..', 'build', 'Release', 'ilystream_napi.node'));

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const PW = 320, PH = 240;   // program output
const VW = 180, VH = 320;   // vertical output

engine.initializeSystem();
const eng = engine.createEngine({ width: PW, height: PH, fps: 60, enableValidation: false });

const solid = (r, g, b) => {
  const buf = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < buf.length; i += 4) { buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = 255; }
  return engine.engineCreateTextureFromPixels(eng, 16, 16, buf);
};
const red = solid(220, 20, 20);
const blue = solid(20, 20, 220);

const outputIndex = engine.engineCreateOutput(eng, VW, VH);
console.log('created output index:', outputIndex);

const layer = (texture, w, h) => ([{
  texture,
  transform: {
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: w, y: h, z: 1 }, anchor: { x: 0, y: 0 }, pivot: { x: 0, y: 0 },
    crop: { left: 0, top: 0, right: 0, bottom: 0 }, visibility: true, opacity: 1.0
  },
  opacity: 1.0, blendMode: 1
}]);

// Same engine, same textures, different layer list per output.
engine.engineSetLayers(eng, layer(red, PW, PH));
engine.engineSetLayers(eng, layer(blue, VW, VH), outputIndex);
sleep(200);

const programBuf = Buffer.alloc(PW * PH * 4);
const program = engine.engineReadPixels(eng, programBuf);
const verticalBuf = Buffer.alloc(VW * VH * 4);
const vertical = engine.engineReadPixels(eng, verticalBuf, outputIndex);
console.log('program  ->', program);
console.log('vertical ->', vertical);

const px = (buf, w, h) => {
  const i = ((h >> 1) * w + (w >> 1)) * 4;
  return [buf[i], buf[i + 1], buf[i + 2]];
};
const p = px(programBuf, PW, PH);
const v = px(verticalBuf, VW, VH);
console.log('program center:', p, 'vertical center:', v);

engine.engineDestroyOutput(eng, outputIndex);
engine.engineDestroyTexture(eng, red);
engine.engineDestroyTexture(eng, blue);
engine.destroyEngine(eng);
engine.shutdownSystem();

const ok = program.result === 0 && vertical.result === 0 &&
  program.width === PW && program.height === PH &&
  vertical.width === VW && vertical.height === VH &&
  p[0] > 180 && p[2] < 70 && v[2] > 180 && v[0] < 70;
console.log(ok ? 'OUTPUTS OK' : 'OUTPUTS FAIL');
process.exit(ok ? 0 : 1);
