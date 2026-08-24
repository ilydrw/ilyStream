import { ipcMain } from 'electron'
import { SegmentationWorkerService } from '../../services/segmentation-worker-service'
import type { SegmentationFrame } from '../../../shared/segmentation-worker'

/**
 * Bridges the renderer's segmentation facade to the native onnxruntime-node
 * worker. `segment` rejects when the worker is unavailable (e.g. no model
 * downloaded yet); the renderer catches that and falls back to the MediaPipe
 * path so virtual backgrounds keep working.
 */
export function registerSegmentationHandlers(
  segmentationWorkerService: SegmentationWorkerService
): void {
  ipcMain.handle('segmentation:preload', () => segmentationWorkerService.preload())
  ipcMain.handle(
    'segmentation:segment',
    (_event, frame: SegmentationFrame) => segmentationWorkerService.segment(frame)
  )
  ipcMain.handle('segmentation:get-status', () => segmentationWorkerService.getStatus())
}
