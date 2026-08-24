import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

type ProcessorInstance = {
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean
}

describe('broadcast audio processor', () => {
  const postMessage = vi.fn()
  let Processor!: new () => ProcessorInstance

  beforeAll(async () => {
    class MockAudioWorkletProcessor {
      readonly port = { postMessage }
    }

    vi.stubGlobal('AudioWorkletProcessor', MockAudioWorkletProcessor)
    vi.stubGlobal('registerProcessor', vi.fn((_name: string, ctor: new () => ProcessorInstance) => {
      Processor = ctor
    }))

    await import('./broadcast-processor')
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('emits stereo silence when no mixer input is connected', () => {
    const processor = new Processor()
    const outputs = [[new Float32Array(128), new Float32Array(128)]]

    for (let i = 0; i < 8; i++) {
      expect(processor.process([[]], outputs, {})).toBe(true)
    }

    expect(postMessage).toHaveBeenCalledTimes(1)
    const [buffer] = postMessage.mock.calls[0]
    const samples = new Float32Array(buffer)
    expect(samples).toHaveLength(2048)
    expect(samples.every(sample => sample === 0)).toBe(true)
  })

  it('copies mono input into both output channels', () => {
    postMessage.mockClear()
    const processor = new Processor()
    const mono = new Float32Array(128).fill(0.25)
    const outputs = [[new Float32Array(128), new Float32Array(128)]]

    for (let i = 0; i < 8; i++) {
      processor.process([[mono]], outputs, {})
    }

    const [buffer] = postMessage.mock.calls[0]
    const samples = new Float32Array(buffer)
    expect(samples[0]).toBe(0.25)
    expect(samples[1]).toBe(0.25)
    expect(samples[2046]).toBe(0.25)
    expect(samples[2047]).toBe(0.25)
  })
})
