// src/main/services/virtual-camera-service.ts
import { EventEmitter } from 'events'
import * as os from 'os'
import { execFileSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  VirtualCameraInfo,
  VirtualCameraPlatform,
  VirtualCameraState,
  StartVirtualCameraOptions
} from '../../shared/virtual-camera'
import { StreamingService, type VideoFramePayload } from './streaming-service'

const DEFAULT_CAMERA_NAME = 'ilyStream Virtual Camera'
const DEFAULT_SOURCE_CLSID = '{6ED0F705-6D87-4A62-A28D-C4DE6F1FF16B}'
const DEFAULT_BRIDGE_WIDTH = 1280
const DEFAULT_BRIDGE_HEIGHT = 720
const DEFAULT_LINUX_DEVICE = '/dev/video0'
const WINDOWS_BUILD_HINT = 'Build the ilyStream Windows virtual camera native binaries with npm run build:virtual-camera.'
const WINDOWS_REGISTER_HINT = 'Register the ilyStream Windows virtual camera from an elevated PowerShell with npm run install:virtual-camera.'
const WINDOWS_FRAME_BRIDGE_HINT = 'Build the ilyStream Windows virtual camera frame bridge with npm run build:virtual-camera.'
const MACOS_DRIVER_HINT = 'Install the ilyStream macOS virtual camera extension to create an OS camera source, or use OBS Virtual Camera from the output menu.'
const LINUX_DRIVER_HINT = 'Install and configure v4l2loopback, then expose a writable /dev/video device for ilyStream.'
const BRIDGE_PIPE_MAGIC = 0x46564349
const BRIDGE_VERSION = 1
const BRIDGE_FORMAT_BGRA32 = 1
const BRIDGE_HEADER_BYTES = 36

interface VirtualCameraServiceOptions {
  hostPlatform?: NodeJS.Platform
  videoDeviceExists?: (path: string) => boolean
  nativeControlPath?: string
  nativeMediaSourcePath?: string
  nativeFrameBridgePath?: string
  mediaSourceRegistered?: (clsid: string, expectedDll?: string) => boolean
  startFrameBridge?: (path: string) => any
}

export class VirtualCameraService extends EventEmitter {
  private state: VirtualCameraState = 'inactive'
  private platform: VirtualCameraPlatform = 'unsupported'
  private lastError?: string
  private deviceName?: string
  private canStart = false
  private needsDriver = false
  private driverHint?: string
  private nativeControlPath?: string
  private nativeMediaSourcePath?: string
  private nativeFrameBridgePath?: string
  private mediaSourceRegistered = false
  private frameBridgeProcess?: any
  private frameBridgeBackpressured = false
  private outputId = 'virtual-camera-session'

  constructor(
    private streamingService: StreamingService,
    private options: VirtualCameraServiceOptions = {}
  ) {
    super()
    this.nativeControlPath = this.findNativeControlPath()
    this.nativeMediaSourcePath = this.findNativeMediaSourcePath()
    this.nativeFrameBridgePath = this.findNativeFrameBridgePath()
    this.detectPlatform(options.hostPlatform ?? os.platform())
  }

  private detectPlatform(platform: NodeJS.Platform) {
    if (platform === 'win32') {
      this.platform = 'windows-mf-native'
      this.deviceName = DEFAULT_CAMERA_NAME
      this.mediaSourceRegistered = this.isWindowsMediaSourceRegistered()
      this.canStart = Boolean(this.nativeControlPath && this.nativeMediaSourcePath && this.nativeFrameBridgePath && this.mediaSourceRegistered)
      this.needsDriver = !this.canStart

      if (this.canStart) {
        this.state = 'inactive'
        this.driverHint = undefined
        this.lastError = undefined
      } else {
        this.state = 'unsupported'
        this.driverHint = this.getWindowsDriverHint()
        this.lastError = this.driverHint
      }
    } else if (platform === 'linux') {
      this.platform = 'linux-v4l2loopback'
      this.deviceName = DEFAULT_LINUX_DEVICE
      this.needsDriver = !this.videoDeviceExists(DEFAULT_LINUX_DEVICE)
      this.canStart = !this.needsDriver
      if (this.needsDriver) {
        this.state = 'unsupported'
        this.driverHint = LINUX_DRIVER_HINT
        this.lastError = LINUX_DRIVER_HINT
      }
    } else if (platform === 'darwin') {
      this.platform = 'macos-native'
      this.state = 'unsupported'
      this.deviceName = DEFAULT_CAMERA_NAME
      this.canStart = false
      this.needsDriver = true
      this.driverHint = MACOS_DRIVER_HINT
      this.lastError = MACOS_DRIVER_HINT
    } else {
      this.platform = 'unsupported'
      this.state = 'unsupported'
      this.canStart = false
      this.driverHint = 'Virtual camera is not supported on this platform.'
      this.lastError = this.driverHint
    }
  }

  public getStatus(): VirtualCameraInfo {
    if (this.platform === 'windows-mf-native' && (this.state === 'inactive' || this.state === 'unsupported')) {
      this.refreshWindowsNativeAvailability()
    }

    return {
      platform: this.platform,
      state: this.state,
      lastError: this.lastError,
      deviceName: this.deviceName,
      canStart: this.canStart,
      needsDriver: this.needsDriver,
      driverHint: this.driverHint,
      nativeControlAvailable: Boolean(this.nativeControlPath),
      nativeControlPath: this.nativeControlPath,
      nativeMediaSourceAvailable: Boolean(this.nativeMediaSourcePath),
      nativeMediaSourcePath: this.nativeMediaSourcePath,
      nativeFrameBridgeAvailable: Boolean(this.nativeFrameBridgePath),
      nativeFrameBridgePath: this.nativeFrameBridgePath,
      mediaSourceRegistered: this.mediaSourceRegistered
    }
  }

  private setState(newState: VirtualCameraState, error?: string) {
    this.state = newState
    this.lastError = error
    this.emit('status-change', this.getStatus())
  }

  public async start(options?: StartVirtualCameraOptions): Promise<void> {
    if (this.state === 'active' || this.state === 'starting') return
    if (!this.canStart || this.state === 'unsupported') {
      const message = this.driverHint || 'Virtual camera is not supported on this platform'
      this.setState('unsupported', message)
      throw new Error(message)
    }

    this.setState('starting')

    try {
      if (this.platform === 'windows-mf-native') {
        // The camera was registered + started during install.ps1 with
        // Lifetime_System, so it stays visible to consumer apps across
        // reboots. At runtime we only need to spawn the frame bridge so
        // ilyStream pixels replace the synthetic test pattern.
        this.startWindowsFrameBridge()
        this.setState('active')
        return
      }

      const rtmpUrl = this.getPlatformDeviceUrl(options)
      
      await this.streamingService.startStream({
        outputId: this.outputId,
        outputName: this.deviceName || 'Virtual Camera',
        rtmpUrl: rtmpUrl,
        streamKey: '',
        width: options?.width || 1920,
        height: options?.height || 1080,
        fps: options?.fps || 30,
        bitrateKbps: options?.bitrateKbps || 10000,
        inputFormat: 'mjpeg',
        audioFormat: 'silent',
        audioSampleRate: options?.audioSampleRate
      })

      this.setState('active')
    } catch (err: any) {
      this.setState('error', err.message)
      throw err
    }
  }

  public async stop(): Promise<void> {
    if (this.state === 'inactive' || this.state === 'unsupported') return

    try {
      if (this.platform === 'windows-mf-native') {
        // Stopping ilyStream output should leave the OS camera registered;
        // consumer apps continue to see the device (it falls back to the
        // synthetic test pattern). Only the frame bridge needs to go.
        this.stopWindowsFrameBridge()
        this.setState('inactive')
        return
      }

      // Use the specific output session stopping method
      this.streamingService.stopStreamOutput(this.outputId)
      this.setState('inactive')
    } catch (err: any) {
      this.setState('error', err.message)
    }
  }

  private getPlatformDeviceUrl(options?: StartVirtualCameraOptions): string {
    switch (this.platform) {
      case 'linux-v4l2loopback':
        return options?.deviceName || this.deviceName || DEFAULT_LINUX_DEVICE
      default:
        throw new Error(this.driverHint || 'Virtual camera is not supported on this platform')
    }
  }

  public feedVideoFrame(frame: VideoFramePayload): void {
    if (this.platform !== 'windows-mf-native') return
    if (this.state !== 'active' && this.state !== 'starting') return
    if (frame.outputId !== this.outputId) return
    if (frame.format !== 'bgra') return
    if (!this.frameBridgeProcess?.stdin || this.frameBridgeProcess.stdin.destroyed) return

    const width = frame.width || DEFAULT_BRIDGE_WIDTH
    const height = frame.height || DEFAULT_BRIDGE_HEIGHT
    const stride = frame.stride || width * 4
    const data = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
    const expectedMinimum = stride * height

    if (width !== DEFAULT_BRIDGE_WIDTH || height !== DEFAULT_BRIDGE_HEIGHT) return
    if (data.byteLength < expectedMinimum) return
    if (this.frameBridgeBackpressured) return

    const header = Buffer.alloc(BRIDGE_HEADER_BYTES)
    header.writeUInt32LE(BRIDGE_PIPE_MAGIC, 0)
    header.writeUInt32LE(BRIDGE_VERSION, 4)
    header.writeUInt32LE(width, 8)
    header.writeUInt32LE(height, 12)
    header.writeUInt32LE(stride, 16)
    header.writeUInt32LE(BRIDGE_FORMAT_BGRA32, 20)
    header.writeUInt32LE(data.byteLength, 24)
    header.writeBigUInt64LE(BigInt(Math.max(0, Math.floor(frame.timestamp ?? Date.now() * 1000))), 28)

    try {
      const accepted = this.frameBridgeProcess.stdin.write(Buffer.concat([header, data]))
      if (!accepted) {
        this.frameBridgeBackpressured = true
        this.frameBridgeProcess.stdin.once?.('drain', () => {
          this.frameBridgeBackpressured = false
        })
      }
    } catch {
      this.frameBridgeBackpressured = false
    }
  }

  private videoDeviceExists(path: string): boolean {
    return (this.options.videoDeviceExists || existsSync)(path)
  }

  private findNativeControlPath(): string | undefined {
    if (this.options.nativeControlPath !== undefined) return this.options.nativeControlPath
    if (this.options.hostPlatform && this.options.hostPlatform !== 'win32') return undefined

    const exeName = 'IlyStreamVirtualCameraRegistrar.exe'
    const candidates = [
      join(process.cwd(), 'native', 'virtual-camera', 'bin', 'x64', 'Release', exeName),
      join((process as any).resourcesPath || '', 'native', 'virtual-camera', exeName),
      join((process as any).resourcesPath || '', exeName)
    ]

    return candidates.find(candidate => candidate && existsSync(candidate))
  }

  private findNativeMediaSourcePath(): string | undefined {
    if (this.options.nativeMediaSourcePath !== undefined) return this.options.nativeMediaSourcePath
    if (this.options.hostPlatform && this.options.hostPlatform !== 'win32') return undefined

    const dllName = 'VirtualCameraMediaSource.dll'
    const candidates = [
      join(process.cwd(), 'native', 'virtual-camera', 'bin', 'x64', 'Release', dllName),
      join((process as any).resourcesPath || '', 'native', 'virtual-camera', dllName),
      join((process as any).resourcesPath || '', dllName)
    ]

    return candidates.find(candidate => candidate && existsSync(candidate))
  }

  private findNativeFrameBridgePath(): string | undefined {
    if (this.options.nativeFrameBridgePath !== undefined) return this.options.nativeFrameBridgePath
    if (this.options.hostPlatform && this.options.hostPlatform !== 'win32') return undefined

    const exeName = 'IlyStreamVirtualCameraBridge.exe'
    const candidates = [
      join(process.cwd(), 'native', 'virtual-camera', 'bin', 'x64', 'Release', exeName),
      join((process as any).resourcesPath || '', 'native', 'virtual-camera', exeName),
      join((process as any).resourcesPath || '', exeName)
    ]

    return candidates.find(candidate => candidate && existsSync(candidate))
  }

  private refreshWindowsNativeAvailability(): void {
    this.nativeControlPath = this.findNativeControlPath()
    this.nativeMediaSourcePath = this.findNativeMediaSourcePath()
    this.nativeFrameBridgePath = this.findNativeFrameBridgePath()
    this.mediaSourceRegistered = this.isWindowsMediaSourceRegistered()
    this.canStart = Boolean(this.nativeControlPath && this.nativeMediaSourcePath && this.nativeFrameBridgePath && this.mediaSourceRegistered)
    this.needsDriver = !this.canStart
    this.driverHint = this.canStart ? undefined : this.getWindowsDriverHint()

    if (this.canStart) {
      this.state = 'inactive'
      this.lastError = undefined
    } else {
      this.state = 'unsupported'
      this.lastError = this.driverHint
    }
  }

  private getWindowsDriverHint(): string {
    if (!this.nativeControlPath || !this.nativeMediaSourcePath) return WINDOWS_BUILD_HINT
    if (!this.nativeFrameBridgePath) return WINDOWS_FRAME_BRIDGE_HINT
    if (!this.mediaSourceRegistered) return WINDOWS_REGISTER_HINT
    return 'ilyStream Windows virtual camera is not available.'
  }

  private isWindowsMediaSourceRegistered(): boolean {
    if (this.options.mediaSourceRegistered) {
      return this.options.mediaSourceRegistered(DEFAULT_SOURCE_CLSID, this.nativeMediaSourcePath)
    }

    const key = `HKLM\\SOFTWARE\\Classes\\CLSID\\${DEFAULT_SOURCE_CLSID}\\InProcServer32`

    try {
      const defaultOutput = execFileSync('reg.exe', ['query', key, '/ve'], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const threadingOutput = execFileSync('reg.exe', ['query', key, '/v', 'ThreadingModel'], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })

      const registeredDll = this.parseRegistryDefaultValue(defaultOutput)
      const hasThreadingModel = /ThreadingModel\s+REG_SZ\s+Both/i.test(threadingOutput)
      return Boolean(registeredDll && existsSync(registeredDll) && hasThreadingModel)
    } catch {
      return false
    }
  }

  private parseRegistryDefaultValue(output: string): string | undefined {
    const match = output.match(/\(Default\)\s+REG_SZ\s+(.+)/i)
    return match?.[1]?.trim()
  }

  private startWindowsFrameBridge(): void {
    if (this.frameBridgeProcess && !this.frameBridgeProcess.killed) return
    if (!this.nativeFrameBridgePath) throw new Error(WINDOWS_FRAME_BRIDGE_HINT)

    const child = this.options.startFrameBridge
      ? this.options.startFrameBridge(this.nativeFrameBridgePath)
      : spawn(this.nativeFrameBridgePath, [], {
          stdio: ['pipe', 'ignore', 'pipe'],
          windowsHide: true
        })

    this.frameBridgeProcess = child
    this.frameBridgeBackpressured = false

    child.stderr?.on?.('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) console.warn(`[VirtualCameraBridge] ${line}`)
    })

    child.on?.('exit', () => {
      if (this.frameBridgeProcess === child) {
        this.frameBridgeProcess = undefined
        this.frameBridgeBackpressured = false
        if (this.state === 'active' || this.state === 'starting') {
          this.setState('error', 'Virtual camera frame bridge exited.')
        }
      }
    })

    child.on?.('error', (err: Error) => {
      this.setState('error', err.message)
    })
  }

  private stopWindowsFrameBridge(): void {
    const child = this.frameBridgeProcess
    this.frameBridgeProcess = undefined
    this.frameBridgeBackpressured = false

    try {
      child?.stdin?.end?.()
    } catch {}

    try {
      if (child && !child.killed) child.kill?.()
    } catch {}
  }

}
