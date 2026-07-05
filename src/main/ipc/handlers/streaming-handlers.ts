import { ipcMain } from 'electron'
import {
  StreamingService,
  type StreamConfig,
  type RecordingConfig,
  type VideoFramePayload,
  type AudioFramePayload
} from '../../services/streaming-service'
import type { VirtualCameraService } from '../../services/virtual-camera-service'

export function registerStreamingHandlers(streamingService: StreamingService, virtualCameraService?: VirtualCameraService): void {
  ipcMain.handle('streaming:start', async (_event, config: StreamConfig) => {
    try {
      await streamingService.startStream(config)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('streaming:stop', () => {
    streamingService.stopStream()
    return { success: true }
  })

  ipcMain.handle('streaming:get-status', () => {
    return streamingService.getStreamStatus()
  })

  ipcMain.handle('streaming:get-outputs', () => {
    return streamingService.getOutputsStatus()
  })

  ipcMain.handle('streaming:stop-output', (_event, outputId: string) => {
    streamingService.stopStreamOutput(outputId)
    return { success: true }
  })

  // Recording Handlers
  ipcMain.handle('streaming:start-recording', async (_event, config: RecordingConfig) => {
    try {
      await streamingService.startRecording(config)
      return { success: true, path: streamingService.getRecordingOutputPath() }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('streaming:stop-recording', () => {
    streamingService.stopRecording()
    return { success: true }
  })

  ipcMain.handle('streaming:get-recording-status', () => {
    return streamingService.getRecordingStatus()
  })

  // Screenshot Handler
  ipcMain.handle('streaming:take-screenshot', (_event, frameData: Buffer) => {
    try {
      const path = streamingService.takeScreenshot(frameData)
      return { success: true, path }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // The high-frequency frame feeding handler
  ipcMain.on('streaming:feed-frame', (_event, frameData: Buffer | VideoFramePayload) => {
    if (isVirtualCameraFrame(frameData)) {
      virtualCameraService?.feedVideoFrame(frameData)
      return
    }

    streamingService.feedVideoFrame(frameData)
  })

  ipcMain.on('streaming:feed-audio', (_event, audioData: Buffer | AudioFramePayload) => {
    streamingService.feedAudioFrame(audioData)
  })
}

function isVirtualCameraFrame(frameData: Buffer | VideoFramePayload): frameData is VideoFramePayload {
  return !Buffer.isBuffer(frameData) &&
    frameData?.outputId === 'virtual-camera-session' &&
    frameData?.format === 'bgra'
}
