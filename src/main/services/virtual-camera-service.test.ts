import { describe, expect, it, vi } from 'vitest'
import { VirtualCameraService } from './virtual-camera-service'

describe('VirtualCameraService', () => {
  it('does not pretend FFmpeg can create a Windows camera device', async () => {
    const streamingService = {
      startStream: vi.fn(),
      stopStreamOutput: vi.fn()
    }
    const service = new VirtualCameraService(streamingService as any, {
      hostPlatform: 'win32',
      nativeControlPath: '',
      nativeMediaSourcePath: '',
      nativeFrameBridgePath: '',
      mediaSourceRegistered: () => false
    })

    expect(service.getStatus()).toEqual(expect.objectContaining({
      platform: 'windows-mf-native',
      state: 'unsupported',
      deviceName: 'ilyStream Virtual Camera',
      canStart: false,
      needsDriver: true
    }))

    await expect(service.start()).rejects.toThrow('virtual camera native binaries')
    expect(streamingService.startStream).not.toHaveBeenCalled()
  })

  it('spawns the frame bridge on start and kills it on stop without touching the OS registration', async () => {
    const streamingService = {
      startStream: vi.fn(),
      stopStreamOutput: vi.fn()
    }
    const bridgeStdin = {
      write: vi.fn().mockReturnValue(true),
      once: vi.fn(),
      end: vi.fn()
    }
    const bridgeProcess = {
      stdin: bridgeStdin,
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      killed: false
    }
    const startFrameBridge = vi.fn().mockReturnValue(bridgeProcess)
    const service = new VirtualCameraService(streamingService as any, {
      hostPlatform: 'win32',
      nativeControlPath: 'C:\\native\\IlyStreamVirtualCameraRegistrar.exe',
      nativeMediaSourcePath: 'C:\\native\\VirtualCameraMediaSource.dll',
      nativeFrameBridgePath: 'C:\\native\\IlyStreamVirtualCameraBridge.exe',
      mediaSourceRegistered: () => true,
      startFrameBridge
    })

    expect(service.getStatus()).toEqual(expect.objectContaining({
      platform: 'windows-mf-native',
      state: 'inactive',
      canStart: true,
      needsDriver: false,
      nativeControlAvailable: true,
      nativeMediaSourceAvailable: true,
      nativeFrameBridgeAvailable: true,
      mediaSourceRegistered: true
    }))

    await service.start()

    expect(startFrameBridge).toHaveBeenCalledWith('C:\\native\\IlyStreamVirtualCameraBridge.exe')
    expect(streamingService.startStream).not.toHaveBeenCalled()
    expect(service.getStatus().state).toBe('active')

    const pixels = new Uint8Array(1280 * 720 * 4)
    pixels[0] = 8
    service.feedVideoFrame({
      outputId: 'virtual-camera-session',
      data: pixels,
      width: 1280,
      height: 720,
      stride: 1280 * 4,
      format: 'bgra',
      timestamp: 12345
    })

    expect(bridgeStdin.write).toHaveBeenCalledTimes(1)
    const packet = bridgeStdin.write.mock.calls[0][0] as Buffer
    expect(packet.readUInt32LE(0)).toBe(0x46564349)
    expect(packet.readUInt32LE(8)).toBe(1280)
    expect(packet.readUInt32LE(12)).toBe(720)
    expect(packet.readUInt32LE(16)).toBe(1280 * 4)
    expect(packet.readUInt32LE(24)).toBe(pixels.byteLength)
    expect(packet[36]).toBe(8)

    await service.stop()

    // Stopping should kill the bridge but leave the OS camera registered so
    // consumer apps keep seeing the device (with the synthetic test pattern).
    expect(bridgeStdin.end).toHaveBeenCalled()
    expect(bridgeProcess.kill).toHaveBeenCalled()
    expect(streamingService.stopStreamOutput).not.toHaveBeenCalled()
    expect(service.getStatus().state).toBe('inactive')
  })

  it('keeps bridge failures visible in status instead of refreshing them away', async () => {
    const streamingService = {
      startStream: vi.fn(),
      stopStreamOutput: vi.fn()
    }
    const handlers = new Map<string, () => void>()
    const bridgeProcess = {
      stdin: { write: vi.fn().mockReturnValue(true), once: vi.fn(), end: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler)
      }),
      kill: vi.fn(),
      killed: false
    }
    const service = new VirtualCameraService(streamingService as any, {
      hostPlatform: 'win32',
      nativeControlPath: 'C:\\native\\IlyStreamVirtualCameraRegistrar.exe',
      nativeMediaSourcePath: 'C:\\native\\VirtualCameraMediaSource.dll',
      nativeFrameBridgePath: 'C:\\native\\IlyStreamVirtualCameraBridge.exe',
      mediaSourceRegistered: () => true,
      startFrameBridge: vi.fn().mockReturnValue(bridgeProcess)
    })

    await service.start()
    handlers.get('exit')?.()

    expect(service.getStatus()).toEqual(expect.objectContaining({
      state: 'error',
      lastError: 'Virtual camera frame bridge exited.'
    }))
  })

  it('can target a configured Linux v4l2loopback device', async () => {
    const streamingService = {
      startStream: vi.fn().mockResolvedValue(undefined),
      stopStreamOutput: vi.fn()
    }
    const service = new VirtualCameraService(streamingService as any, {
      hostPlatform: 'linux',
      videoDeviceExists: (path) => path === '/dev/video0'
    })

    expect(service.getStatus()).toEqual(expect.objectContaining({
      platform: 'linux-v4l2loopback',
      state: 'inactive',
      canStart: true,
      needsDriver: false
    }))

    await service.start({ width: 1280, height: 720, fps: 30 })

    expect(streamingService.startStream).toHaveBeenCalledWith(expect.objectContaining({
      outputId: 'virtual-camera-session',
      rtmpUrl: '/dev/video0',
      streamKey: '',
      width: 1280,
      height: 720,
      fps: 30,
      audioFormat: 'silent'
    }))
    expect(service.getStatus().state).toBe('active')
  })
})
