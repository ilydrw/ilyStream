/*
 * Headless throughput benchmark for the engine's per-frame path: upload a
 * source image, composite it + an overlay, read the frame back. This is the
 * work the compositor does every frame — it does NOT include screen capture.
 *
 *   ELECTRON_RUN_AS_NODE=1 electron.exe native/engine/scripts/bench.cjs
 */
'use strict';
const path = require('path');
const engine = require(path.join(__dirname, '..', 'build', 'Release', 'ilystream_napi.node'));

function makeImage(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) { buf[i] = i & 255; buf[i+1] = (i>>2)&255; buf[i+2] = (i>>4)&255; buf[i+3] = 255; }
  return buf;
}
const now = () => Number(process.hrtime.bigint()) / 1e6;

function bench(W, H, N) {
  const eng = engine.createEngine({ width: W, height: H, fps: 60, enableValidation: false });
  const src = makeImage(W, H);
  const overlay = engine.engineCreateColorTexture(eng, 0x19c8ffff);
  const readBuf = Buffer.alloc(W * H * 4);
  const T = { create: 0, layers: 0, read: 0 };
  let prev = null;

  const oTransform = { position:{x:W*0.7,y:H*0.8,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:W*0.2,y:H*0.1,z:1}, anchor:{x:0,y:0}, pivot:{x:0,y:0}, crop:{left:0,top:0,right:0,bottom:0}, visibility:true, opacity:1 };
  const iTransform = { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:1,y:1,z:1}, anchor:{x:0,y:0}, pivot:{x:0,y:0}, crop:{left:0,top:0,right:0,bottom:0}, visibility:true, opacity:1 };

  // warm up
  for (let i = 0; i < 5; i++) { const t = engine.engineCreateTextureFromPixels(eng, W, H, src); engine.engineSetLayers(eng, [{texture:t,transform:iTransform,opacity:1,blendMode:1}]); engine.engineReadPixels(eng, readBuf); engine.engineDestroyTexture(eng, t); }

  const t0 = now();
  for (let i = 0; i < N; i++) {
    let t = now();
    const tex = engine.engineCreateTextureFromPixels(eng, W, H, src);
    T.create += now() - t;

    t = now();
    engine.engineSetLayers(eng, [
      { texture: tex, transform: iTransform, opacity: 1, blendMode: 1 },
      { texture: overlay, transform: oTransform, opacity: 0.55, blendMode: 1 }
    ]);
    T.layers += now() - t;

    t = now();
    engine.engineReadPixels(eng, readBuf);
    T.read += now() - t;

    if (prev !== null) engine.engineDestroyTexture(eng, prev);
    prev = tex;
  }
  const total = now() - t0;
  engine.destroyEngine(eng);

  const fps = (N / total) * 1000;
  console.log(`${W}x${H}: ${fps.toFixed(1)} fps over ${N} frames (${(total/N).toFixed(2)} ms/frame)  ` +
    `| upload ${(T.create/N).toFixed(2)}ms  setLayers ${(T.layers/N).toFixed(2)}ms  readback ${(T.read/N).toFixed(2)}ms`);
}

engine.initializeSystem();
bench(640, 360, 300);
bench(1280, 720, 300);
bench(1920, 1080, 200);
engine.shutdownSystem();
console.log('BENCH DONE');
