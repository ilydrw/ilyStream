import React, { useRef, useState, useEffect } from 'react'

export function usePreviewViewportScale(previewFrame: { width: number; height: number } | undefined) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!containerRef.current || !previewFrame?.width || !previewFrame?.height) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const scaleX = width / previewFrame.width
        const scaleY = height / previewFrame.height
        setScale(Math.min(scaleX, scaleY))
      }
    })
    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [previewFrame?.width, previewFrame?.height])

  return {
    containerRef,
    viewportStyle: previewFrame ? ({
      width: `${previewFrame.width}px`,
      height: `${previewFrame.height}px`,
      transform: `scale(${scale})`,
      transformOrigin: 'top left'
    } as React.CSSProperties) : {}
  }
}
