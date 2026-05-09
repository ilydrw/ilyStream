/**
 * High-performance browser source frame processor.
 * Offloads bitwise pixel manipulation from the main thread to prevent UI choppiness.
 */
self.onmessage = (event: MessageEvent) => {
  const { source, width, height, transparentBackground } = event.data
  const transparentChromaTolerance = Number(event.data.transparentChromaTolerance ?? 8)
  const length = Math.min(source.byteLength, width * height * 4)
  const sourcePixels = new Uint32Array(source.buffer, source.byteOffset, length / 4)
  const targetBuffer = new ArrayBuffer(length)
  const targetPixels = new Uint32Array(targetBuffer)
  let visiblePixels = 0

  if (!transparentBackground) {
    // High-speed bitwise swap (BGRA -> RGBA)
    for (let i = 0; i < sourcePixels.length; i++) {
      const v = sourcePixels[i]
      const alpha = v >>> 24
      const red = (v >>> 16) & 0xff
      const green = (v >>> 8) & 0xff
      const blue = v & 0xff
      if (alpha > 8 && red + green + blue > 18) visiblePixels++
      targetPixels[i] = (v & 0xff00ff00) | ((v & 0xff0000) >> 16) | ((v & 0xff) << 16)
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
      
      const red = (v >>> 16) & 0xff
      const green = (v >>> 8) & 0xff
      const blue = v & 0xff
      
      // Chroma key optimization
      if (alpha >= 250 && red <= transparentChromaTolerance && green <= transparentChromaTolerance && blue <= transparentChromaTolerance) {
        targetPixels[i] = 0
      } else {
        if (alpha > 8) visiblePixels++
        targetPixels[i] = (alpha << 24) | (blue << 16) | (green << 8) | red
      }
    }
  }

  // Create an ImageBitmap from the processed buffer for GPU-accelerated rendering
  const imageData = new ImageData(new Uint8ClampedArray(targetBuffer), width, height)
  createImageBitmap(imageData).then(bitmap => {
    const blankThreshold = Math.max(4, Math.min(96, Math.floor((width * height) * 0.00003)))
    self.postMessage({ bitmap, id: event.data.id, width, height, isBlank: visiblePixels < blankThreshold }, [bitmap])
  })
}
