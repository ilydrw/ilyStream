import { describe, expect, it, vi } from 'vitest'
import { H264PipeWriter } from './h264-pipe-writer'

function frame(id: number, isKeyFrame: boolean) {
  return { data: new Uint8Array([id]), isKeyFrame }
}

describe('H264PipeWriter', () => {
  it('drops dependent frames after overflow and resumes on a keyframe', () => {
    const pipe = {
      write: vi.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true),
      discard: vi.fn(),
      discardQueued: vi.fn()
    }
    const writer = new H264PipeWriter(pipe)

    expect(writer.write(frame(1, false))).toBe(false)
    expect(writer.write(frame(2, false))).toBe(false)
    expect(writer.write(frame(3, true))).toBe(true)

    expect(pipe.discard).toHaveBeenCalledWith(expect.objectContaining({ 0: 2 }))
    expect(pipe.discardQueued).toHaveBeenCalledOnce()
    expect(pipe.write).toHaveBeenCalledTimes(2)
  })

  it('waits for the following keyframe when a keyframe itself overflows', () => {
    const pipe = {
      write: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
      discard: vi.fn(),
      discardQueued: vi.fn()
    }
    const writer = new H264PipeWriter(pipe)

    writer.write(frame(1, true))
    writer.write(frame(2, false))
    writer.write(frame(3, true))

    expect(pipe.discard).toHaveBeenCalledOnce()
    expect(pipe.write).toHaveBeenCalledTimes(2)
  })
})
