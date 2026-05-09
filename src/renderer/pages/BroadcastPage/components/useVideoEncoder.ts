import { useEffect, useRef } from 'react'
import RendererWorker from '../../../workers/renderer.worker?worker'

export function useVideoEncoder(
  outputActive: boolean,
  config: {
    format: 'h264' | 'mjpeg'
    fps: number
    bitrate: number
    width: number
    height: number
    codec?: string
  },
  onStop: () => void
) {
  const workerRef = useRef<Worker | null>(null)
  const firstVideoChunkReceivedRef = useRef(false)

  useEffect(() => {
    if (!outputActive) return

    const worker = new RendererWorker()
    workerRef.current = worker
    firstVideoChunkReceivedRef.current = false

    const offscreen = document.createElement('canvas').transferControlToOffscreen()
    offscreen.width = config.width
    offscreen.height = config.height

    worker.onmessage = (event: MessageEvent) => {
      const { type, buffer, isKey, timestamp, message } = event.data
      if (type === 'chunk' && buffer) {
        firstVideoChunkReceivedRef.current = true
        window.api.streaming.feedFrame({
          data: new Uint8Array(buffer),
          isKeyFrame: isKey === true,
          timestamp: timestamp
        } as any)
      } else if (type === 'error') {
        console.error('[VideoEncoder] Worker failed:', message)
        onStop()
      }
    }

    worker.postMessage({
      type: 'init',
        payload: {
          canvas: offscreen,
          format: config.format,
          width: config.width,
          height: config.height,
          fps: config.fps,
        bitrate: config.bitrate * 1000,
        codec: config.codec
      }
    }, [offscreen])

    return () => {
      worker.postMessage({ type: 'shutdown' })
      setTimeout(() => worker.terminate(), 250)
      workerRef.current = null
    }
  }, [outputActive, config.format, config.width, config.height, config.fps, config.bitrate, config.codec])

  return { workerRef, firstVideoChunkReceivedRef }
}
