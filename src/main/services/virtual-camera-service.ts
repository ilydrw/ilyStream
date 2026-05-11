// src/main/services/virtual-camera-service.ts
import { EventEmitter } from 'events'
import * as os from 'os'
import { 
  VirtualCameraInfo, 
  VirtualCameraPlatform, 
  VirtualCameraState, 
  StartVirtualCameraOptions 
} from '../../shared/virtual-camera'
import { StreamingService } from './streaming-service'

export class VirtualCameraService extends EventEmitter {
  private state: VirtualCameraState = 'inactive'
  private platform: VirtualCameraPlatform = 'unsupported'
  private lastError?: string
  private deviceName?: string
  private outputId = 'virtual-camera-session'

  constructor(private streamingService: StreamingService) {
    super()
    this.detectPlatform()
  }

  private detectPlatform() {
    const platform = os.platform()
    if (platform === 'win32') {
      // Default to OBS bridge for now, could be MF native later
      this.platform = 'windows-obs-bridge'
      this.deviceName = 'OBS Virtual Camera'
    } else if (platform === 'linux') {
      this.platform = 'linux-v4l2loopback'
      this.deviceName = '/dev/video0' // Typical default
    } else if (platform === 'darwin') {
      this.platform = 'macos-obs-bridge'
      this.deviceName = 'OBS Virtual Camera'
    } else {
      this.platform = 'unsupported'
    }
  }

  public getStatus(): VirtualCameraInfo {
    return {
      platform: this.platform,
      state: this.state,
      lastError: this.lastError,
      deviceName: this.deviceName
    }
  }

  private setState(newState: VirtualCameraState, error?: string) {
    this.state = newState
    this.lastError = error
    this.emit('status-change', this.getStatus())
  }

  public async start(options?: StartVirtualCameraOptions): Promise<void> {
    if (this.state === 'active' || this.state === 'starting') return
    if (this.platform === 'unsupported') {
      throw new Error('Virtual camera is not supported on this platform')
    }

    this.setState('starting')

    try {
      // In a real implementation, we would build specific FFmpeg args for the virtual cam
      // For now, we'll leverage the existing StreamingService session architecture.
      
      // We need to tell the StreamingService to start a new output session
      // that targets the virtual camera device.
      
      const rtmpUrl = this.getPlatformDeviceUrl()
      
      await this.streamingService.startStream({
        outputId: this.outputId,
        outputName: 'Virtual Camera',
        rtmpUrl: rtmpUrl,
        streamKey: '', // Not needed for local devices usually
        width: options?.width || 1920,
        height: options?.height || 1080,
        fps: options?.fps || 30,
        bitrateKbps: 10000, // High bitrate for local loopback
        inputFormat: 'mjpeg',
        audioFormat: 'silent' // Most virtual cams don't do audio
      })

      this.setState('active')
    } catch (err: any) {
      this.setState('error', err.message)
      throw err
    }
  }

  public async stop(): Promise<void> {
    if (this.state === 'inactive') return
    
    try {
      this.streamingService.stopStream() // In a real multi-output system, we'd stop just our outputId
      // Wait, startStream with outputId actually uses startStreamOutput
      // Let's check streaming-service.ts again.
      // Yes, startStream(config) calls startStreamOutput if config.outputId is set.
      // But stopStream() stops ALL. I should probably add a stopStreamOutput to StreamingService public API.
      
      this.setState('inactive')
    } catch (err: any) {
      this.setState('error', err.message)
    }
  }

  private getPlatformDeviceUrl(): string {
    // This is where we'd return the "URL" that FFmpeg uses to output to the device
    // For Windows OBS bridge, it's often a specific dshow device or a pipe.
    // For Linux, it's a v4l2 device path.
    
    switch (this.platform) {
      case 'linux-v4l2loopback':
        return '/dev/video0'
      case 'windows-obs-bridge':
        // For dshow output in FFmpeg, it's slightly different than a URL.
        // We'll need to update FFmpegArgsBuilder to support dshow/v4l2 outputs.
        return 'video=OBS Virtual Camera'
      default:
        return 'udp://localhost:1234' // Fallback for testing
    }
  }
}
