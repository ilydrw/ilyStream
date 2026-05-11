/**
 * High-performance browser source frame processor.
 * Offloads bitwise pixel manipulation from the main thread to prevent UI choppiness.
 */
self.onmessage = (event: MessageEvent) => {
  const { source, width, height, transparentBackground } = event.data
  const transparentChromaTolerance = Number(event.data.transparentChromaTolerance ?? 8)
  const frameBytes = toByteView(source)
  const targetWidth = Math.max(1, Math.round(Number(width) || 1))
  const targetHeight = Math.max(1, Math.round(Number(height) || 1))
  const expectedLength = targetWidth * targetHeight * 4
  const length = Math.min(frameBytes?.byteLength || 0, expectedLength)
  const sourcePixels = frameBytes ? toPixelView(frameBytes, length) : new Uint32Array(0)
  const targetBuffer = new ArrayBuffer(expectedLength)
  const targetPixels = new Uint32Array(targetBuffer)
  let visiblePixels = 0

  if (!transparentBackground) {
    // High-speed bitwise swap (BGRA -> RGBA)
    for (let i = 0; i < sourcePixels.length; i++) {
      const v = sourcePixels[i]
      targetPixels[i] = (v & 0xff00ff00) | ((v & 0xff0000) >> 16) | ((v & 0xff) << 16)
      // Sampling-based blank detection (every 16th pixel)
      if ((i & 15) === 0) {
        if ((v >>> 24) > 8 && (v & 0xffffff) > 0) visiblePixels += 16
      }
    }
  } else {
    // Optimized transparency check
    for (let i = 0; i < sourcePixels.length; i++) {
      const v = sourcePixels[i]
      const alpha = (v >>> 24)
      if (alpha < 5) {
        targetPixels[i] = 0
        continue
      }
      
      const blue = v & 0xff
      const green = (v >>> 8) & 0xff
      const red = (v >>> 16) & 0xff
      
      // Chroma key optimization: mostly dark or keyed pixels
      if (alpha >= 250 && red <= transparentChromaTolerance && green <= transparentChromaTolerance && blue <= transparentChromaTolerance) {
        targetPixels[i] = 0
      } else {
        if ((i & 15) === 0) visiblePixels += 16
        targetPixels[i] = (alpha << 24) | (blue << 16) | (green << 8) | red
      }
    }
  }

  // Create an ImageBitmap from the processed buffer for GPU-accelerated rendering
  const imageData = new ImageData(new Uint8ClampedArray(targetBuffer), targetWidth, targetHeight)
  createImageBitmap(imageData).then(bitmap => {
    const blankThreshold = Math.max(4, Math.min(96, Math.floor((targetWidth * targetHeight) * 0.00003)))
    self.postMessage({ bitmap, id: event.data.id, width: targetWidth, height: targetHeight, isBlank: visiblePixels < blankThreshold }, [bitmap])
  })
}

function toByteView(source: unknown): Uint8Array | null {
  if (source instanceof ArrayBuffer) return new Uint8Array(source)
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  }
  return null
}

function toPixelView(bytes: Uint8Array, length: number): Uint32Array {
  const alignedLength = Math.floor(length / 4) * 4
  if (alignedLength <= 0) return new Uint32Array(0)
  if (bytes.byteOffset % 4 === 0) {
    return new Uint32Array(bytes.buffer, bytes.byteOffset, alignedLength / 4)
  }

  const aligned = new Uint8Array(alignedLength)
  aligned.set(bytes.subarray(0, alignedLength))
  return new Uint32Array(aligned.buffer)
}
