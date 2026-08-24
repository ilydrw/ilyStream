import { EventEmitter } from 'events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakePipe extends EventEmitter {
  writable = true
  write = vi.fn<(data: Uint8Array) => boolean>()
}

class FakeChild extends EventEmitter {
  stdin = new FakePipe()
  stderr = new EventEmitter()
  stdio: unknown[] = [this.stdin, null, this.stderr, null]
  exitCode: number | null = null
  killed = false
  kill = vi.fn(() => {
    this.killed = true
    return true
  })
}

let child: FakeChild
const spawnMock = vi.fn(() => child)

vi.mock('child_process', () => ({ spawn: spawnMock }))

const { FFmpegProcessManager } = await import('./ffmpeg-process-manager')

function frame(size: number, isKeyFrame: boolean, fill: number) {
  return {
    data: new Uint8Array(size).fill(fill),
    isKeyFrame
  }
}

describe('FFmpegProcessManager recording video backpressure', () => {
  beforeEach(() => {
    child = new FakeChild()
    spawnMock.mockClear()
  })

  it('drops dependent H.264 frames after overflow and resumes from the next keyframe', () => {
    child.stdin.write.mockReturnValueOnce(false).mockReturnValue(true)
    const manager = new FFmpegProcessManager('recording-test')
    manager.start('ffmpeg', [], false, 'h264')

    expect(manager.writeVideo(frame(16, false, 1))).toBe(true)
    expect(manager.writeVideo(frame(1_500_000, false, 2))).toBe(true)
    expect(manager.writeVideo(frame(1_000_000, false, 3))).toBe(false)
    expect(manager.writeVideo(frame(16, false, 4))).toBe(false)

    const keyFrame = frame(16, true, 5)
    expect(manager.writeVideo(keyFrame)).toBe(true)
    child.stdin.emit('drain')

    expect(child.stdin.write).toHaveBeenCalledTimes(2)
    expect(child.stdin.write).toHaveBeenLastCalledWith(expect.objectContaining({ 0: 5 }))
    expect(manager.getStats()).toBe('video drops=3')
  })

  it('writes MJPEG frame bytes without applying H.264 resync policy', () => {
    child.stdin.write.mockReturnValue(true)
    const manager = new FFmpegProcessManager('recording-test')
    manager.start('ffmpeg', [], false, 'mjpeg')
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

    expect(manager.writeVideo(jpeg)).toBe(true)
    expect(child.stdin.write).toHaveBeenCalledWith(expect.objectContaining({ 0: 0xff, 1: 0xd8 }))
    expect(manager.getStats()).toBe('')
  })
})
