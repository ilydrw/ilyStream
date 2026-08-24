/*
 * Hardware/N-API smoke for the demand-driven Program video export.
 * Run with Electron's Node ABI:
 *   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe \
 *     native/engine/scripts/smoke_program_export.cjs
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const engine = require(path.join(__dirname, '..', 'build', 'Release', 'ilystream_napi.node'));

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

engine.initializeSystem();
let instance = null;
try {
  instance = engine.createEngine({
    width: 320,
    height: 180,
    fps: 60,
    enableValidation: false,
    linearBlending: true,
  });

  assert.throws(() => engine.engineGetProgramExportDescriptor(instance));
  assert.equal(engine.engineSetProgramExportEnabled(instance, true), 0);
  sleep(60);

  const descriptor = engine.engineGetProgramExportDescriptor(instance);
  assert.equal(descriptor.version, 1);
  assert.equal(descriptor.width, 320);
  assert.equal(descriptor.height, 180);
  assert.equal(descriptor.slotCount, 2);
  assert.equal(descriptor.controlBlockVersion, 1);
  assert.equal(descriptor.controlBlockSize, 128);
  assert.ok(descriptor.generation > 0n);
  assert.ok(descriptor.frameSequence > 0n);

  const duplicated = engine.engineDuplicateProgramExportHandles(
    instance,
    process.pid,
    descriptor.generation,
    descriptor.slotCount,
  );
  assert.equal(duplicated.version, 1);
  assert.equal(duplicated.generation, descriptor.generation);
  assert.equal(duplicated.slotCount, 2);
  assert.equal(duplicated.textureHandles.length, 2);
  assert.ok(duplicated.textureHandles.every((handle) => handle > 0n));
  assert.ok(duplicated.controlHandle > 0n);

  assert.equal(engine.engineSetProgramExportEnabled(instance, false), 0);
  console.log(JSON.stringify({
    version: descriptor.version,
    generation: descriptor.generation.toString(),
    frameSequence: descriptor.frameSequence.toString(),
    width: descriptor.width,
    height: descriptor.height,
    slots: descriptor.slotCount,
    controlBlockVersion: descriptor.controlBlockVersion,
  }));
  console.log('PROGRAM EXPORT SMOKE OK');
} finally {
  if (instance !== null) engine.destroyEngine(instance);
  engine.shutdownSystem();
}
