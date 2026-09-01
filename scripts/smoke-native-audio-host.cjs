const { spawn } = require('child_process')
const { randomBytes } = require('crypto')
const net = require('net')
const path = require('path')

const root = path.resolve(__dirname, '..')
const hostPath = process.env.ILYSTREAM_CORE_HOST_PATH ||
  path.join(root, 'native', 'engine', 'build', 'Release', 'ilystream_core_host.exe')
const addonPath = process.env.ILY_AUDIO_ADDON ||
  path.join(root, 'native', 'engine', 'build', 'Release', 'ilystream_audio.node')
const addon = require(addonPath)
const suffix = `ilyStream.Core.${process.pid}.${randomBytes(12).toString('hex')}`
const capability = randomBytes(32).toString('base64url')
const child = spawn(hostPath, [], {
  cwd: path.dirname(hostPath),
  env: { ...process.env, ILYSTREAM_CORE_PIPE: suffix, ILYSTREAM_CORE_CAPABILITY: capability },
  stdio: ['ignore', 'ignore', 'pipe'],
  windowsHide: true
})

let nextId = 1
let buffered = ''
const pending = new Map()

async function connect() {
  const deadline = Date.now() + 5000
  let lastError = new Error('Native host pipe was not created')
  while (Date.now() < deadline) {
    try {
      return await new Promise((resolve, reject) => {
        const socket = net.createConnection(`\\\\.\\pipe\\${suffix}`)
        socket.once('connect', () => resolve(socket))
        socket.once('error', reject)
      })
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw lastError
}

function request(socket, method, params = {}, metadata = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.write(`${JSON.stringify({ id, method, params, ...metadata })}\n`)
  })
}

function waitForExit(timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Native host did not exit')), timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function main() {
  const socket = await connect()
  socket.on('data', (chunk) => {
    buffered += chunk.toString()
    for (;;) {
      const newline = buffered.indexOf('\n')
      if (newline < 0) break
      const response = JSON.parse(buffered.slice(0, newline))
      buffered = buffered.slice(newline + 1)
      const waiter = pending.get(response.id)
      if (!waiter) continue
      pending.delete(response.id)
      if (response.ok) waiter.resolve(response.result)
      else waiter.reject(new Error(response.error || 'Native host request failed'))
    }
  })

  await request(socket, 'hello', {}, { protocol: 4, capability })
  const mixer = await request(socket, 'mixer.evaluate', {
    sequence: 1,
    sources: [
      { id: 'program-mic', volume: 0.8, pan: 0, muted: false, solo: false, global: false, mono: true, monitoringMode: 'off' },
      { id: 'preview-mic', volume: 1, pan: 0, muted: false, solo: false, global: false, mono: false, monitoringMode: 'off' }
    ],
    activeLayerIds: ['program-mic'],
    retainedLayerIds: ['program-mic', 'preview-mic']
  })
  if (mixer.sequence !== 1 || Math.abs(mixer.routes?.[0]?.effectiveGain - 0.8) > 1e-5 || mixer.routes?.[1]?.sceneGain !== 0) {
    throw new Error('Native mixer policy smoke test returned invalid decisions')
  }
  let rejectedForgedGlobal = false
  try {
    await request(socket, 'mixer.evaluate', {
      sequence: 2,
      sources: [{ id: 'attacker', volume: 1, pan: 0, muted: false, solo: false, global: true, mono: false, monitoringMode: 'off' }],
      activeLayerIds: [],
      retainedLayerIds: []
    })
  } catch {
    rejectedForgedGlobal = true
  }
  if (!rejectedForgedGlobal) throw new Error('Native mixer accepted a forged global source')
  const sourceGeneration = BigInt(`0x${randomBytes(8).toString('hex')}`) || 1n
  const sourceRing = `Local\\ilyStream.Mixer.Source.${randomBytes(16).toString('hex')}`
  const sourceDescriptor = {
    ringName: sourceRing,
    generation: sourceGeneration,
    sampleRate: 48000,
    channels: 2,
    capacityFrames: 96256,
    blockFrames: 1024
  }
  addon.createSharedMixerSourceWriter(sourceDescriptor)
  const nativeProgram = await request(socket, 'mixer.startTransport', {
    sources: [{
      id: 'program-shadow',
      ringName: sourceRing,
      generation: sourceGeneration.toString(),
      gain: 0.5,
      pan: 0,
      mono: false
    }]
  })
  const nativeMixedFrame = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for native mixed Program PCM')), 5000)
    let delivered = false
    addon.startSharedCaptureReader({
      ...nativeProgram,
      generation: BigInt(nativeProgram.generation),
      exclusive: false,
      chunkFrames: nativeProgram.blockFrames
    }, (payload) => {
      if (delivered) return
      delivered = true
      clearTimeout(timer)
      resolve(payload)
    })
  })
  const sourcePcm = new Float32Array(2048).fill(0.25)
  if (!addon.pushSharedMixerSource(sourceRing, Buffer.from(sourcePcm.buffer), process.hrtime.bigint())) {
    throw new Error('Could not publish native mixer source PCM')
  }
  const mixedPayload = await nativeMixedFrame
  addon.stopSharedCaptureReader()
  const mixerTransportStatus = await request(socket, 'mixer.transportStatus')
  await request(socket, 'mixer.stopTransport')
  addon.closeSharedMixerSourceWriter(sourceRing)
  if (
    !(mixedPayload.pcm instanceof Float32Array) || mixedPayload.pcm.length !== 2048 ||
    Math.abs(mixedPayload.pcm[0] - 0.125) > 1e-5 || mixerTransportStatus.blocksMixed < 1
  ) throw new Error('Native mixer transport returned invalid Program PCM')
  const transport = await request(socket, 'audio.startCapture', {
    sampleRate: 48000,
    channels: 2,
    exclusive: false
  })
  const frame = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for shared PCM')), 5000)
    let delivered = false
    addon.startSharedCaptureReader({ ...transport, generation: BigInt(transport.generation) }, (payload) => {
      if (delivered) return
      delivered = true
      clearTimeout(timer)
      resolve(payload)
    })
  })
  const local = addon.stopSharedCaptureReader()
  const remote = await request(socket, 'audio.stopCapture')
  await request(socket, 'shutdown')
  socket.destroy()
  await waitForExit(5000)
  if (!(frame.pcm instanceof Float32Array) || frame.pcm.length === 0 || child.exitCode !== 0) {
    throw new Error('Native shared-audio smoke test returned invalid data')
  }
  console.log(JSON.stringify({
    samples: frame.pcm.length,
    mixerRoutes: mixer.routes.length,
    nativeMixerFrames: mixedPayload.pcm.length / 2,
    sharedFramesCaptured: local.framesCaptured,
    hostFramesCaptured: remote.framesCaptured,
    hostExitCode: child.exitCode
  }))
}

main().catch((error) => {
  try { addon.stopSharedCaptureReader() } catch {}
  if (child.exitCode === null) child.kill()
  console.error(error)
  process.exitCode = 1
})
